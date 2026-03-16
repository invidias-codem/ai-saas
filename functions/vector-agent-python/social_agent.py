import logging
import os
from atproto import Client, client_utils
import time
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase for session caching
if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()

logger = logging.getLogger(__name__)


class SocialAgent:
    """
    Eyes and hands for Vector on Bluesky (AT Protocol).
    Handles auth, search, notifications, posting, liking, and replying.
    """

    def __init__(self):
        self.handle = os.environ.get("BLUESKY_HANDLE")
        self.password = os.environ.get("BLUESKY_PASSWORD")
        self.client = Client()
        self.is_connected = False

    def connect(self) -> bool:
        if self.is_connected:
            return True
        if not self.handle or not self.password:
            logger.error("❌ Bluesky credentials missing (BLUESKY_HANDLE / BLUESKY_PASSWORD)")
            return False

        doc_ref = db.collection('vector_state').document('bluesky_session')

        # 0. Check if we're currently rate-limited on createSession — skip this run
        try:
            doc = doc_ref.get()
            doc_data = doc.to_dict() if doc.exists else {}
        except Exception as e:
            logger.error(f"❌ Firestore read failed: {e}")
            return False

        rate_limited_until = doc_data.get('rate_limited_until', 0)
        if rate_limited_until > time.time():
            remaining = int(rate_limited_until - time.time())
            logger.warning(f"⏳ Bluesky createSession rate-limited. Skipping for {remaining}s.")
            return False

        # 1. Try resuming from cached session string
        session_str = doc_data.get('session_string')
        if session_str:
            logger.info(f"🔌 Resuming Bluesky session for {self.handle}...")
            try:
                self.client.login(session_string=session_str)
                # ⚠️ Critical: save the refreshed session back — atproto rotates the
                # refresh token on each use. Without this write, every subsequent
                # invocation re-uses the same stale (already-rotated) token and falls
                # through to password login, burning through the 10/day createSession limit.
                refreshed = self.client.export_session_string()
                doc_ref.set({'session_string': refreshed}, merge=True)
                self.is_connected = True
                logger.info("✅ Resumed Bluesky session and persisted refreshed token.")
                return True
            except Exception as e:
                logger.warning(f"⚠️ Session resume failed: {e}. Attempting password login...")

        # 2. Distributed lock: only one Cloud Run instance should call createSession
        #    at a time. Use a Firestore transaction to claim the lock.
        lock_ref = db.collection('vector_state').document('bluesky_session_lock')
        lock_expiry = time.time() + 30  # 30s lock TTL

        @firestore.transactional
        def claim_lock(transaction: firestore.Transaction) -> bool:
            lock_doc = lock_ref.get(transaction=transaction)
            lock_data = lock_doc.to_dict() if lock_doc.exists else {}
            if lock_data.get('locked_until', 0) > time.time():
                return False  # Another instance holds the lock
            transaction.set(lock_ref, {'locked_until': lock_expiry})
            return True

        got_lock = claim_lock(db.transaction())
        if not got_lock:
            logger.warning("🔒 Another instance is creating a Bluesky session. Skipping this run.")
            return False

        try:
            logger.info(f"🔌 Creating new Bluesky session as {self.handle}...")
            self.client.login(self.handle, self.password)
            self.is_connected = True
            new_session = self.client.export_session_string()
            doc_ref.set({'session_string': new_session, 'rate_limited_until': 0}, merge=True)
            logger.info("✅ Connected to Bluesky and cached new session.")
            return True
        except Exception as e:
            err_str = str(e)
            if '429' in err_str or 'RateLimitExceeded' in err_str:
                reset_ts = time.time() + 86400
                doc_ref.set({'rate_limited_until': reset_ts}, merge=True)
                logger.error(f"❌ Failed to connect to Bluesky: {e}")
                logger.warning(f"⛔ createSession rate limit hit — backing off until {int(reset_ts)}")
            else:
                logger.error(f"❌ Bluesky login failed: {e}")
            return False
        finally:
            # Release the lock regardless of outcome
            lock_ref.set({'locked_until': 0})

    # ── Feed / Discovery ──────────────────────────────────────────────────────

    def get_timeline_text(self, limit: int = 15) -> list[str]:
        if not self.connect():
            return []
        try:
            response = self.client.get_timeline(algorithm="reverse-chronological", limit=limit)
            return [
                item.post.record.text
                for item in response.feed
                if hasattr(item.post.record, "text")
            ]
        except Exception as e:
            logger.error(f"❌ Timeline fetch failed: {e}")
            return []

    def search_posts(self, query: str, limit: int = 15) -> list:
        if not self.connect():
            return []
        try:
            result = self.client.app.bsky.feed.search_posts(params={"q": query, "limit": limit})
            return result.posts
        except Exception as e:
            logger.error(f"❌ Search failed for '{query}': {e}")
            return []

    def check_notifications(self, limit: int = 20) -> list:
        if not self.connect():
            return []
        try:
            response = self.client.app.bsky.notification.list_notifications(params={"limit": limit})
            seen_uris = set()
            posts = []

            for n in response.notifications:
                if n.reason not in ("mention", "reply"):
                    continue
                if n.uri in seen_uris:
                    continue
                seen_uris.add(n.uri)

                class SimplePost:
                    def __init__(self, notif):
                        self.cid = notif.cid
                        self.uri = notif.uri
                        self.author = notif.author
                        self.record = notif.record
                        self.reason = notif.reason

                posts.append(SimplePost(n))

            return posts
        except Exception as e:
            logger.error(f"❌ Notifications fetch failed: {e}")
            return []

    # ── Actions ───────────────────────────────────────────────────────────────

    def post_thought(self, content: str) -> str | None:
        if not self.connect():
            return None
        try:
            if len(content) > 300:
                content = content[:297] + "..."
            logger.info(f"🚀 Posting: {content[:60]}...")
            post = self.client.send_post(text=content)
            logger.info(f"✅ Posted! CID: {post.cid}")
            return post.cid
        except Exception as e:
            logger.error(f"❌ Post failed: {e}")
            return None

    def post_with_media(self, content: str, image_path: str, alt_text: str = "Image") -> str | None:
        if not self.connect():
            return None
        try:
            if len(content) > 300:
                content = content[:297] + "..."
            with open(image_path, "rb") as f:
                img_data = f.read()
            upload = self.client.upload_blob(img_data)
            images = [client_utils.Image(alt=alt_text, image=upload.blob)]
            post = self.client.send_images(text=content, images=images)
            logger.info(f"✅ Posted with media! CID: {post.cid}")
            return post.cid
        except Exception as e:
            logger.error(f"❌ Media post failed: {e}")
            return None

    def like_post(self, uri: str, cid: str) -> bool:
        if not self.connect():
            return False
        try:
            self.client.like(uri=uri, cid=cid)
            logger.info(f"❤️ Liked: {uri.split('/')[-1]}")
            return True
        except Exception as e:
            logger.error(f"❌ Like failed: {e}")
            return False

    def reply_to_post(self, parent_post, reply_text: str) -> bool:
        if not self.connect():
            return False
        try:
            if len(reply_text) > 300:
                reply_text = reply_text[:297] + "..."

            parent_ref = {"cid": parent_post.cid, "uri": parent_post.uri}
            root_ref = parent_ref

            if hasattr(parent_post.record, "reply") and parent_post.record.reply:
                root_ref = parent_post.record.reply.root

            self.client.send_post(
                text=reply_text,
                reply_to={"root": root_ref, "parent": parent_ref},
            )
            logger.info(f"↩️ Replied to {parent_post.uri.split('/')[-1]}: {reply_text[:40]}...")
            return True
        except Exception as e:
            logger.error(f"❌ Reply failed: {e}")
            return False
