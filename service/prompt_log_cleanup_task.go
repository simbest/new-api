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
	promptLogCleanupRetention = 32 * 24 * time.Hour
	promptLogCleanupHour      = 1
)

var (
	promptLogCleanupOnce    sync.Once
	promptLogCleanupRunning atomic.Bool
)

func StartPromptLogCleanupTask() {
	promptLogCleanupOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}

		gopool.Go(func() {
			logger.LogInfo(context.Background(), "prompt log cleanup task started: daily at 01:00, retention=32d")

			timer := time.NewTimer(durationUntilNextPromptLogCleanup(time.Now()))
			defer timer.Stop()

			for {
				<-timer.C
				runPromptLogCleanupOnce()
				timer.Reset(durationUntilNextPromptLogCleanup(time.Now()))
			}
		})
	})
}

func durationUntilNextPromptLogCleanup(now time.Time) time.Duration {
	next := time.Date(now.Year(), now.Month(), now.Day(), promptLogCleanupHour, 0, 0, 0, now.Location())
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next.Sub(now)
}

func runPromptLogCleanupOnce() {
	if !promptLogCleanupRunning.CompareAndSwap(false, true) {
		return
	}
	defer promptLogCleanupRunning.Store(false)

	ctx := context.Background()
	cutoff := time.Now().Add(-promptLogCleanupRetention).Unix()
	logsDeleted, contentsDeleted, err := model.DeleteOldPromptLogs(ctx, cutoff)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("prompt log cleanup failed: %v", err))
		return
	}
	logger.LogInfo(ctx, fmt.Sprintf("prompt log cleanup completed: cutoff=%d, prompt_logs=%d, prompt_log_contents=%d", cutoff, logsDeleted, contentsDeleted))
}
