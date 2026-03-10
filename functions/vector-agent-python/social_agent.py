import logging
import os
from atproto import Client, client_utils
import time

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
        try:
            logger.info(f"🔌 Connecting to Bluesky as {self.handle}...")
            self.client.login(self.handle, self.password)
            self.is_connected = True
            logger.info("✅ Connected to Bluesky.")
            return True
        except Exception as e:
            logger.error(f"❌ Bluesky login failed: {e}")
            return False

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
