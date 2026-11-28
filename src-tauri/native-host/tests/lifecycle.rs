use lattice_native_host::lifecycle::{
    Launcher, NativeHost, Phase, ProcessControl, ProcessEvent, SpawnedProcess,
};
use lattice_native_host::{HostError, LaunchCredential};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc,
};
use tokio::sync::{mpsc, Notify};

#[derive(Clone, Default)]
struct Probe {
    launches: Arc<AtomicUsize>,
    kills: Arc<AtomicUsize>,
    spawned: Arc<Notify>,
}
struct Unresponsive(Probe);
struct Control {
    probe: Probe,
    events: mpsc::Sender<ProcessEvent>,
    killed: AtomicBool,
}
impl ProcessControl for Control {
    fn terminate(&self) {
        if !self.killed.swap(true, Ordering::AcqRel) {
            self.probe.kills.fetch_add(1, Ordering::AcqRel);
            // An old launch may emit readiness while it is being retired.
            let _ = self.events.try_send(ProcessEvent::Stdout(
                b"{\"status\":\"ready\",\"port\":49123}\n".to_vec(),
            ));
            let _ = self.events.try_send(ProcessEvent::Exited(false));
        }
    }
    fn release(&self) {}
}
impl Launcher for Unresponsive {
    fn spawn(&self, _: &LaunchCredential) -> Result<SpawnedProcess, HostError> {
        self.0.launches.fetch_add(1, Ordering::AcqRel);
        let (events, rx) = mpsc::channel(4);
        let control = Arc::new(Control {
            probe: self.0.clone(),
            events,
            killed: AtomicBool::new(false),
        });
        self.0.spawned.notify_one();
        Ok(SpawnedProcess {
            control,
            events: rx,
        })
    }
}

#[tokio::test(start_paused = true)]
async fn concurrent_restart_does_not_launch_a_second_child() {
    let host = Arc::new(NativeHost::default());
    let probe = Probe::default();
    let owner = host.clone();
    let first = probe.clone();
    let startup = tokio::spawn(async move { owner.start(Unresponsive(first)).await });
    probe.spawned.notified().await;
    assert_eq!(
        host.restart(Unresponsive(probe.clone())).await,
        Err(HostError::Busy)
    );
    assert_eq!(probe.launches.load(Ordering::Acquire), 1);
    assert_eq!(host.shutdown().await, Err(HostError::CleanupUncertain));
    assert_eq!(startup.await.unwrap(), Err(HostError::CleanupUncertain));
    assert_eq!(probe.kills.load(Ordering::Acquire), 1);
}

#[tokio::test(start_paused = true)]
async fn disappearing_ipc_caller_does_not_abandon_the_owned_transition() {
    let host = Arc::new(NativeHost::default());
    let probe = Probe::default();
    let owner = host.clone();
    let first = probe.clone();
    let caller = tokio::spawn(async move { owner.start(Unresponsive(first)).await });
    probe.spawned.notified().await;
    caller.abort();
    assert_eq!(host.shutdown().await, Err(HostError::CleanupUncertain));
    assert_eq!(probe.kills.load(Ordering::Acquire), 1);
    assert_eq!(host.phase(), Phase::Failed(HostError::CleanupUncertain));
    assert_eq!(
        host.restart(Unresponsive(probe.clone())).await,
        Err(HostError::Closed)
    );
    assert_eq!(probe.launches.load(Ordering::Acquire), 1);
}

#[tokio::test(start_paused = true)]
async fn forced_cleanup_is_bounded_and_refuses_a_replacement() {
    let host = Arc::new(NativeHost::default());
    let probe = Probe::default();
    let started = tokio::time::Instant::now();
    assert_eq!(
        host.start(Unresponsive(probe.clone())).await,
        Err(HostError::CleanupUncertain)
    );
    assert!(started.elapsed() <= std::time::Duration::from_secs(15));
    assert_eq!(
        host.restart(Unresponsive(probe.clone())).await,
        Err(HostError::CleanupUncertain)
    );
    assert_eq!(probe.launches.load(Ordering::Acquire), 1);
    assert_eq!(probe.kills.load(Ordering::Acquire), 1);
}

struct Fails;
impl Launcher for Fails {
    fn spawn(&self, _: &LaunchCredential) -> Result<SpawnedProcess, HostError> {
        Err(HostError::SpawnFailed)
    }
}
#[tokio::test]
async fn a_failed_spawn_can_be_retried_without_stale_ownership() {
    let host = Arc::new(NativeHost::default());
    assert_eq!(host.start(Fails).await, Err(HostError::SpawnFailed));
    assert_eq!(host.restart(Fails).await, Err(HostError::SpawnFailed));
    assert_eq!(host.phase(), Phase::Failed(HostError::SpawnFailed));
    assert_eq!(host.shutdown().await, Ok(()));
}
