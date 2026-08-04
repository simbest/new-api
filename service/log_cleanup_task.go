package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/bytedance/gopkg/util/gopool"
)

const (
	logCleanupRetention = 32 * 24 * time.Hour
	logCleanupHour      = 2
	logCleanupBatchSize = 1000
)

var (
	logCleanupOnce    sync.Once
	logCleanupRunning atomic.Bool
)

func StartLogCleanupTask() {
	logCleanupOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}

		gopool.Go(func() {
			logger.LogInfo(context.Background(), "log cleanup task started: daily at 02:00, retention=32d")

			timer := time.NewTimer(durationUntilNextLogCleanup(time.Now()))
			defer timer.Stop()

			for {
				<-timer.C
				runLogCleanupOnce()
				timer.Reset(durationUntilNextLogCleanup(time.Now()))
			}
		})
	})
}

func durationUntilNextLogCleanup(now time.Time) time.Duration {
	next := time.Date(now.Year(), now.Month(), now.Day(), logCleanupHour, 0, 0, 0, now.Location())
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next.Sub(now)
}

func runLogCleanupOnce() {
	if !logCleanupRunning.CompareAndSwap(false, true) {
		return
	}
	defer logCleanupRunning.Store(false)

	ctx := context.Background()
	cutoff := time.Now().Add(-logCleanupRetention).Unix()
	deleted, err := model.DeleteOldLog(ctx, cutoff, logCleanupBatchSize)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("log cleanup failed: %v", err))
		return
	}
	logger.LogInfo(ctx, fmt.Sprintf("log cleanup completed: cutoff=%d, logs=%d", cutoff, deleted))
}
