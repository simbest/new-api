package model

import "context"

func DeleteOldPromptLogs(ctx context.Context, targetTimestamp int64) (logsTotal int64, contentsTotal int64, err error) {
	if err = ctx.Err(); err != nil {
		return 0, 0, err
	}

	contentResult := LOG_DB.Where("created_at < ?", targetTimestamp).Delete(&PromptLogContent{})
	if contentResult.Error != nil {
		return 0, 0, contentResult.Error
	}
	contentsTotal = contentResult.RowsAffected

	if err = ctx.Err(); err != nil {
		return 0, contentsTotal, err
	}

	logResult := LOG_DB.Where("created_at < ?", targetTimestamp).Delete(&PromptLog{})
	if logResult.Error != nil {
		return 0, contentsTotal, logResult.Error
	}
	logsTotal = logResult.RowsAffected

	return logsTotal, contentsTotal, nil
}
