// Package lifecycle owns daemon work across HTTP requests and background jobs.
package lifecycle

import (
	"context"
	"errors"
	"sync"
)

var ErrStopping = errors.New("local service is stopping")

type Group struct {
	ctx      context.Context
	cancel   context.CancelFunc
	mu       sync.Mutex
	stopping bool
	work     sync.WaitGroup
	done     chan struct{}
}

func New(parent context.Context) *Group {
	ctx, cancel := context.WithCancel(parent)
	return &Group{ctx: ctx, cancel: cancel, done: make(chan struct{})}
}

func (g *Group) Context() context.Context { return g.ctx }

// Begin registers before shutdown can start waiting. Both the request and the
// daemon cancel the work; background jobs use the daemon context as parent.
func (g *Group) Begin(parent context.Context) (context.Context, func(), error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.stopping || g.ctx.Err() != nil || parent.Err() != nil {
		return nil, nil, ErrStopping
	}
	g.work.Add(1)
	ctx, cancel := context.WithCancel(g.ctx)
	stop := context.AfterFunc(parent, cancel)
	var once sync.Once
	return ctx, func() { once.Do(func() { stop(); cancel(); g.work.Done() }) }, nil
}

func (g *Group) Stop() {
	g.mu.Lock()
	if g.stopping {
		g.mu.Unlock()
		return
	}
	g.stopping = true
	g.cancel()
	g.mu.Unlock()
	go func() { g.work.Wait(); close(g.done) }()
}

// Wait is called after Stop; the caller supplies the overall cleanup deadline.
func (g *Group) Wait(ctx context.Context) error {
	select {
	case <-g.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
