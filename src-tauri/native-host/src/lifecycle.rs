//! Serialized native process ownership. Platform adapters only spawn, terminate,
//! and report confirmed exits; protocol and lifecycle policy live here.
use crate::review::{
    DisplayAcknowledgement, ProposalInput, ProposalSummary, ReviewDecision, ReviewDocument,
    ReviewLease,
};
use crate::workspace::{DirectoryList, FileStat, FolderPicker, GrantInfo, ReadInput, TextRead};
use crate::{HostError, LaunchCredential, RpcSession, StartupHandshake, Status, STARTUP_TIMEOUT};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, Weak,
};
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, watch, Mutex as AsyncMutex};

const GRACE: Duration = Duration::from_secs(6);
const FORCE_WAIT: Duration = Duration::from_secs(2);

pub enum ProcessEvent {
    Stdout(Vec<u8>),
    Exited(bool),
    Error,
}

pub trait ProcessControl: Send + Sync {
    /// Signal termination without blocking the caller. Exit must be confirmed
    /// separately through ProcessEvent::Exited, including after fallback kill.
    fn terminate(&self);
    /// Release an already exited child's handle without killing a reused PID.
    fn release(&self);
}

pub struct SpawnedProcess {
    pub control: Arc<dyn ProcessControl>,
    pub events: mpsc::Receiver<ProcessEvent>,
}

pub trait Launcher: Send + Sync {
    fn spawn(&self, credential: &LaunchCredential) -> Result<SpawnedProcess, HostError>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Booting,
    Ready,
    Stopping,
    Stopped,
    Failed(HostError),
}

struct Instance {
    control: Arc<dyn ProcessControl>,
    exited: watch::Receiver<Option<bool>>,
}

struct State {
    generation: u64,
    phase: Phase,
    instance: Option<Arc<Instance>>,
    session: Option<Arc<RpcSession>>,
    startup_cancel: Option<watch::Sender<bool>>,
    cleanup_uncertain: bool,
}

pub struct NativeHost {
    state: Mutex<State>,
    operation: AsyncMutex<()>,
    exiting: AtomicBool,
}

impl Default for NativeHost {
    fn default() -> Self {
        Self {
            state: Mutex::new(State {
                generation: 0,
                phase: Phase::Booting,
                instance: None,
                session: None,
                startup_cancel: None,
                cleanup_uncertain: false,
            }),
            operation: AsyncMutex::new(()),
            exiting: AtomicBool::new(false),
        }
    }
}

impl NativeHost {
    pub async fn propose_operation(
        self: &Arc<Self>,
        input: ProposalInput,
    ) -> Result<ProposalSummary, HostError> {
        let (g, s) = self.workspace_session()?;
        let r = s.propose_operation(input).await;
        self.workspace_result(g, &s, r)
    }
    pub async fn proposal_status(self: &Arc<Self>, id: &str) -> Result<ProposalSummary, HostError> {
        let (g, s) = self.workspace_session()?;
        let r = s.proposal_status(id).await;
        self.workspace_result(g, &s, r)
    }
    pub async fn cancel_proposal(self: &Arc<Self>, id: &str) -> Result<(), HostError> {
        let (g, s) = self.workspace_session()?;
        let r = s.cancel_proposal(id).await;
        self.workspace_result(g, &s, r)
    }
    pub async fn begin_review(self: &Arc<Self>, id: &str) -> Result<ReviewLease, HostError> {
        let (g, s) = self.workspace_session()?;
        let r = s.begin_review(id).await;
        self.workspace_result(g, &s, r)
    }
    pub async fn review_document(
        self: &Arc<Self>,
        lease: &ReviewLease,
    ) -> Result<ReviewDocument, HostError> {
        let (g, s) = self.workspace_session()?;
        let r = s.review_document(lease).await;
        self.workspace_result(g, &s, r)
    }
    pub async fn acknowledge_review(
        self: &Arc<Self>,
        lease: &ReviewLease,
        input: DisplayAcknowledgement,
    ) -> Result<(), HostError> {
        let (g, s) = self.workspace_session()?;
        let r = s.acknowledge_review(lease, input).await;
        self.workspace_result(g, &s, r)
    }
    pub async fn decide_review(
        self: &Arc<Self>,
        lease: &ReviewLease,
        input: ReviewDecision,
    ) -> Result<(), HostError> {
        let (g, s) = self.workspace_session()?;
        let r = s.decide_review(lease, input).await;
        self.workspace_result(g, &s, r)
    }
    fn workspace_session(&self) -> Result<(u64, Arc<RpcSession>), HostError> {
        let s = self.state.lock().map_err(|_| HostError::StateUnavailable)?;
        if s.phase != Phase::Ready || self.exiting.load(Ordering::Acquire) {
            return Err(HostError::Closed);
        }
        Ok((
            s.generation,
            s.session.clone().ok_or(HostError::StateUnavailable)?,
        ))
    }

    fn workspace_result<T>(
        self: &Arc<Self>,
        generation: u64,
        session: &RpcSession,
        result: Result<T, HostError>,
    ) -> Result<T, HostError> {
        if !self
            .state
            .lock()
            .map(|s| s.generation == generation && s.phase == Phase::Ready)
            .unwrap_or(false)
        {
            return Err(HostError::Closed);
        }
        if session.is_workspace_blocked() {
            self.fail(generation, HostError::WorkspaceBlocked);
            return Err(HostError::WorkspaceBlocked);
        }
        result
    }

    /// Permission transitions retain ownership if their IPC caller disappears.
    pub async fn select_folder<P: FolderPicker + 'static>(
        self: &Arc<Self>,
        picker: P,
    ) -> Result<Option<GrantInfo>, HostError> {
        let (generation, session) = self.workspace_session()?;
        let host = self.clone();
        tokio::spawn(async move {
            let result = session.select_folder(&picker).await;
            host.workspace_result(generation, &session, result)
        })
        .await
        .map_err(|_| HostError::StateUnavailable)?
    }

    pub async fn revoke_grant(self: &Arc<Self>, grant_id: String) -> Result<(), HostError> {
        let (generation, session) = self.workspace_session()?;
        let host = self.clone();
        tokio::spawn(async move {
            let result = session.revoke_grant(&grant_id).await;
            host.workspace_result(generation, &session, result)
        })
        .await
        .map_err(|_| HostError::StateUnavailable)?
    }

    pub async fn workspace_grants(self: &Arc<Self>) -> Result<Vec<GrantInfo>, HostError> {
        let (generation, session) = self.workspace_session()?;
        let result = session.workspace_grants().await;
        self.workspace_result(generation, &session, result)
    }

    pub async fn read_text(self: &Arc<Self>, input: ReadInput) -> Result<TextRead, HostError> {
        let (generation, session) = self.workspace_session()?;
        let result = session.read_text(input).await;
        self.workspace_result(generation, &session, result)
    }

    pub async fn list_directory(
        self: &Arc<Self>,
        input: ReadInput,
    ) -> Result<DirectoryList, HostError> {
        let (generation, session) = self.workspace_session()?;
        let result = session.list_directory(input).await;
        self.workspace_result(generation, &session, result)
    }

    pub async fn stat_path(self: &Arc<Self>, input: ReadInput) -> Result<FileStat, HostError> {
        let (generation, session) = self.workspace_session()?;
        let result = session.stat_path(input).await;
        self.workspace_result(generation, &session, result)
    }

    pub fn phase(&self) -> Phase {
        self.state
            .lock()
            .map(|s| s.phase)
            .unwrap_or(Phase::Failed(HostError::StateUnavailable))
    }

    // Detached tasks finish ownership transitions even if an IPC caller goes
    // away. Concurrent user operations are rejected instead of being queued.
    pub async fn start<L: Launcher + 'static>(
        self: &Arc<Self>,
        launcher: L,
    ) -> Result<(), HostError> {
        let host = self.clone();
        tokio::spawn(async move { host.transition(launcher, false).await })
            .await
            .map_err(|_| HostError::StateUnavailable)?
    }
    pub async fn restart<L: Launcher + 'static>(
        self: &Arc<Self>,
        launcher: L,
    ) -> Result<(), HostError> {
        let host = self.clone();
        tokio::spawn(async move { host.transition(launcher, true).await })
            .await
            .map_err(|_| HostError::StateUnavailable)?
    }
    async fn transition<L: Launcher>(
        self: &Arc<Self>,
        launcher: L,
        restart: bool,
    ) -> Result<(), HostError> {
        let _operation = self.operation.try_lock().map_err(|_| HostError::Busy)?;
        if self.exiting.load(Ordering::Acquire) {
            return Err(HostError::Closed);
        }
        {
            let s = self.state.lock().map_err(|_| HostError::StateUnavailable)?;
            if s.cleanup_uncertain {
                return Err(HostError::CleanupUncertain);
            }
            if !restart && (s.phase != Phase::Booting || s.instance.is_some()) {
                return Err(HostError::Busy);
            }
        }
        if restart {
            self.stop_inner(Phase::Stopped).await?;
        }
        if self.exiting.load(Ordering::Acquire) {
            return Err(HostError::Closed);
        }
        let result = self.launch(launcher).await;
        if let Err(error) = result {
            let final_phase = if self.exiting.load(Ordering::Acquire) {
                Phase::Stopped
            } else {
                Phase::Failed(error)
            };
            self.stop_inner(final_phase).await?;
        }
        result
    }

    async fn launch<L: Launcher>(self: &Arc<Self>, launcher: L) -> Result<(), HostError> {
        let credential = Arc::new(LaunchCredential::generate()?);
        let (cancel, mut cancelled) = watch::channel(false);
        let generation = {
            let mut s = self.state.lock().map_err(|_| HostError::StateUnavailable)?;
            s.generation += 1;
            s.phase = Phase::Booting;
            s.startup_cancel = Some(cancel);
            s.generation
        };
        let spawned = launcher.spawn(&credential)?;
        let (exited, receipt) = watch::channel(None);
        let instance = Arc::new(Instance {
            control: spawned.control.clone(),
            exited: receipt,
        });
        {
            let mut s = self.state.lock().map_err(|_| HostError::StateUnavailable)?;
            s.instance = Some(instance);
        }
        let (ready, port) = oneshot::channel();
        tokio::spawn(monitor(
            spawned,
            Arc::downgrade(self),
            generation,
            ready,
            exited,
        ));
        let verify = async {
            let port = port.await.map_err(|_| HostError::Exited)??;
            let session = Arc::new(RpcSession::new(port, credential)?);
            {
                let mut s = self.state.lock().map_err(|_| HostError::StateUnavailable)?;
                if s.generation != generation
                    || s.phase != Phase::Booting
                    || self.exiting.load(Ordering::Acquire)
                {
                    return Err(HostError::Closed);
                }
                s.session = Some(session.clone());
            }
            session.status().await?;
            session.bind_native().await?;
            session.status().await?;
            let mut s = self.state.lock().map_err(|_| HostError::StateUnavailable)?;
            if s.generation != generation
                || s.phase != Phase::Booting
                || self.exiting.load(Ordering::Acquire)
            {
                return Err(HostError::Closed);
            }
            s.phase = Phase::Ready;
            s.startup_cancel = None;
            Ok(())
        };
        tokio::select! {
            _=cancelled.changed()=>Err(HostError::Closed),
            result=tokio::time::timeout(STARTUP_TIMEOUT,verify)=>result.map_err(|_|HostError::StartupTimeout)?,
        }
    }

    pub async fn status(self: &Arc<Self>) -> Result<Option<Status>, HostError> {
        let (generation, session) = {
            let s = self.state.lock().map_err(|_| HostError::StateUnavailable)?;
            match s.phase {
                Phase::Booting => return Ok(None),
                Phase::Stopping | Phase::Stopped => return Err(HostError::Closed),
                Phase::Failed(error) => return Err(error),
                Phase::Ready => (
                    s.generation,
                    s.session.clone().ok_or(HostError::StateUnavailable)?,
                ),
            }
        };
        let result = session.status().await;
        if !self
            .state
            .lock()
            .map(|s| s.generation == generation && s.phase == Phase::Ready)
            .unwrap_or(false)
        {
            return Err(HostError::Closed);
        }
        if let Err(error) = result.as_ref() {
            if *error != HostError::Busy {
                self.fail(generation, *error);
            }
        }
        result.map(Some)
    }

    fn fail(self: &Arc<Self>, generation: u64, error: HostError) {
        {
            let Ok(mut s) = self.state.lock() else { return };
            if s.generation != generation
                || matches!(s.phase, Phase::Stopping | Phase::Stopped | Phase::Failed(_))
            {
                return;
            }
            s.phase = Phase::Failed(error);
            if let Some(session) = s.session.as_ref() {
                session.close();
            }
        }
        let host = self.clone();
        tokio::spawn(async move {
            let _operation = host.operation.lock().await;
            let current = host
                .state
                .lock()
                .map(|s| s.generation == generation)
                .unwrap_or(false);
            if current {
                let _ = host.stop_inner(Phase::Failed(error)).await;
            }
        });
    }

    async fn stop_inner(&self, final_phase: Phase) -> Result<(), HostError> {
        let (instance, session) = {
            let mut s = self.state.lock().map_err(|_| HostError::StateUnavailable)?;
            s.generation += 1;
            s.phase = Phase::Stopping;
            if let Some(cancel) = s.startup_cancel.take() {
                cancel.send_replace(true);
            }
            let session = s.session.take();
            if let Some(session) = session.as_ref() {
                session.close();
            }
            (s.instance.clone(), session)
        };
        let mut clean = true;
        if let Some(instance) = instance {
            if instance.exited.borrow().is_none() {
                if let Some(session) = session {
                    let _ = session.shutdown().await;
                }
            }
            match wait_exit(&instance, GRACE).await {
                Some(true) => {}
                Some(false) => clean = false,
                None => {
                    instance.control.terminate();
                    let _ = wait_exit(&instance, FORCE_WAIT).await;
                    // Forced or unconfirmed cleanup is terminal for this app
                    // session. Never start a replacement beside uncertain work.
                    clean = false;
                }
            }
        }
        let mut s = self.state.lock().map_err(|_| HostError::StateUnavailable)?;
        if !clean {
            s.cleanup_uncertain = true;
        }
        if s.cleanup_uncertain {
            s.phase = Phase::Failed(HostError::CleanupUncertain);
            return Err(HostError::CleanupUncertain);
        }
        s.instance = None;
        s.phase = if self.exiting.load(Ordering::Acquire) {
            Phase::Stopped
        } else {
            final_phase
        };
        Ok(())
    }

    pub async fn shutdown(self: &Arc<Self>) -> Result<(), HostError> {
        self.exiting.store(true, Ordering::Release);
        {
            let mut s = self.state.lock().map_err(|_| HostError::StateUnavailable)?;
            s.generation += 1;
            if let Some(cancel) = s.startup_cancel.as_ref() {
                cancel.send_replace(true);
            }
            if let Some(session) = s.session.as_ref() {
                session.close();
            }
        }
        let host = self.clone();
        tokio::spawn(async move {
            let _operation = host.operation.lock().await;
            host.stop_inner(Phase::Stopped).await
        })
        .await
        .map_err(|_| HostError::StateUnavailable)?
    }

    /// Last-resort nonblocking disposal (runtime teardown or owner drop).
    pub fn emergency_stop(&self) {
        self.exiting.store(true, Ordering::Release);
        let Ok(mut s) = self.state.lock() else { return };
        s.generation += 1;
        s.phase = Phase::Stopped;
        if let Some(cancel) = s.startup_cancel.take() {
            cancel.send_replace(true);
        }
        if let Some(session) = s.session.take() {
            session.close();
        }
        if let Some(instance) = s.instance.take() {
            if instance.exited.borrow().is_none() {
                instance.control.terminate();
            }
        }
    }
}

impl Drop for NativeHost {
    fn drop(&mut self) {
        self.emergency_stop();
    }
}

async fn wait_exit(instance: &Instance, timeout: Duration) -> Option<bool> {
    let mut receipt = instance.exited.clone();
    tokio::time::timeout(timeout, async {
        loop {
            if let Some(clean) = *receipt.borrow() {
                return Some(clean);
            }
            if receipt.changed().await.is_err() {
                return None;
            }
        }
    })
    .await
    .unwrap_or(None)
}

async fn monitor(
    mut spawned: SpawnedProcess,
    host: Weak<NativeHost>,
    generation: u64,
    ready: oneshot::Sender<Result<u16, HostError>>,
    exited: watch::Sender<Option<bool>>,
) {
    let mut ready = Some(ready);
    let mut handshake = StartupHandshake::default();
    while let Some(event) = spawned.events.recv().await {
        let error = match event {
            ProcessEvent::Stdout(bytes) if ready.is_some() => match handshake.push(&bytes) {
                Ok(Some(port)) => {
                    if let Some(ready) = ready.take() {
                        let _ = ready.send(Ok(port));
                    }
                    None
                }
                Ok(None) => None,
                Err(error) => Some(error),
            },
            ProcessEvent::Exited(clean) => {
                spawned.control.release();
                exited.send_replace(Some(clean));
                if let Some(ready) = ready.take() {
                    let _ = ready.send(Err(HostError::Exited));
                }
                if let Some(host) = host.upgrade() {
                    host.fail(generation, HostError::Exited);
                }
                return;
            }
            ProcessEvent::Error => Some(HostError::Exited),
            _ => None,
        };
        if let Some(error) = error {
            if let Some(ready) = ready.take() {
                let _ = ready.send(Err(error));
            }
            if let Some(host) = host.upgrade() {
                host.fail(generation, error);
            }
            // Keep draining until a real termination receipt arrives.
        }
    }
    if let Some(host) = host.upgrade() {
        host.fail(generation, HostError::Exited);
    }
}
