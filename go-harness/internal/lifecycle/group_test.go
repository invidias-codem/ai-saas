package lifecycle

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestStopClosesAdmissionAndWaitsForWork(t *testing.T) {
	group := New(context.Background())
	ctx, done, err := group.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	group.Stop()
	if ctx.Err() == nil {
		t.Fatal("active work was not cancelled")
	}
	if _, _, err := group.Begin(context.Background()); !errors.Is(err, ErrStopping) {
		t.Fatal("new work admitted after stop")
	}
	deadline, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if group.Wait(deadline) == nil {
		t.Fatal("reported cleanup before work finished")
	}
	done()
	done() // cleanup is idempotent
	if err := group.Wait(t.Context()); err != nil {
		t.Fatal(err)
	}
}

func TestRequestDisconnectAndDaemonStopCancelSeparateWork(t *testing.T) {
	group := New(context.Background())
	request, cancel := context.WithCancel(context.Background())
	work, done, err := group.Begin(request)
	if err != nil {
		t.Fatal(err)
	}
	defer done()
	background, finish, err := group.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer finish()
	cancel()
	select {
	case <-work.Done():
	case <-time.After(time.Second):
		t.Fatal("disconnect ignored")
	}
	if background.Err() != nil {
		t.Fatal("request disconnected unrelated background work")
	}
	group.Stop()
	if background.Err() == nil {
		t.Fatal("shutdown missed background work")
	}
}
