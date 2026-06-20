package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func GetPromptLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter, ok := getPromptLogFilter(c)
	if !ok {
		return
	}
	logs, total, err := model.GetPromptLogs(pageInfo.GetStartIdx(), pageInfo.GetPageSize(), filter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
}

func getPromptLogFilter(c *gin.Context) (model.PromptLogFilter, bool) {
	filter := model.PromptLogFilter{
		User: strings.TrimSpace(c.Query("user")),
	}
	if startTime := strings.TrimSpace(c.Query("start_time")); startTime != "" {
		timestamp, err := strconv.ParseInt(startTime, 10, 64)
		if err != nil || timestamp < 0 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "invalid start_time",
			})
			return filter, false
		}
		filter.StartTime = timestamp
	}
	if endTime := strings.TrimSpace(c.Query("end_time")); endTime != "" {
		timestamp, err := strconv.ParseInt(endTime, 10, 64)
		if err != nil || timestamp < 0 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "invalid end_time",
			})
			return filter, false
		}
		filter.EndTime = timestamp
	}
	return filter, true
}

func GetPromptLogContent(c *gin.Context) {
	promptLogId, err := strconv.Atoi(c.Param("id"))
	if err != nil || promptLogId <= 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "invalid prompt log id",
		})
		return
	}
	content, err := model.GetPromptLogContent(promptLogId)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "prompt log content not found",
			})
			return
		}
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, content)
}

func CreatePromptLogAnalysis(c *gin.Context) {
	filter, ok := getPromptLogFilter(c)
	if !ok {
		return
	}
	prompt := service.GetPromptLogAnalysisPromptTemplate()
	task, err := model.CreatePromptLogAnalysisTask(filter, prompt, common.PromptLogAnalysisModel)
	if err != nil {
		if errors.Is(err, model.ErrPromptLogAnalysisUserNotUnique) {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "please filter to exactly one user before submitting analysis",
			})
			return
		}
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, task)
}

func GetPromptLogAnalysisTasks(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter, ok := getPromptLogAnalysisTaskFilter(c)
	if !ok {
		return
	}
	tasks, total, err := model.GetPromptLogAnalysisTasks(pageInfo.GetStartIdx(), pageInfo.GetPageSize(), filter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(tasks)
	common.ApiSuccess(c, pageInfo)
}

func getPromptLogAnalysisTaskFilter(c *gin.Context) (model.PromptLogAnalysisTaskFilter, bool) {
	filter := model.PromptLogAnalysisTaskFilter{
		User:   strings.TrimSpace(c.Query("user")),
		Status: strings.TrimSpace(c.Query("status")),
	}
	if startTime := strings.TrimSpace(c.Query("start_time")); startTime != "" {
		timestamp, err := strconv.ParseInt(startTime, 10, 64)
		if err != nil || timestamp < 0 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "invalid start_time",
			})
			return filter, false
		}
		filter.StartTime = timestamp
	}
	if endTime := strings.TrimSpace(c.Query("end_time")); endTime != "" {
		timestamp, err := strconv.ParseInt(endTime, 10, 64)
		if err != nil || timestamp < 0 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "invalid end_time",
			})
			return filter, false
		}
		filter.EndTime = timestamp
	}
	return filter, true
}

func GetPromptLogAnalysisTask(c *gin.Context) {
	taskId, err := strconv.Atoi(c.Param("id"))
	if err != nil || taskId <= 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "invalid analysis task id",
		})
		return
	}
	task, err := model.GetPromptLogAnalysisTask(taskId)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "analysis task not found",
			})
			return
		}
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, task)
}

func RetryPromptLogAnalysisTask(c *gin.Context) {
	taskId, err := strconv.Atoi(c.Param("id"))
	if err != nil || taskId <= 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "invalid analysis task id",
		})
		return
	}
	task, err := model.RetryPromptLogAnalysisTask(taskId)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "analysis task not found",
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	common.ApiSuccess(c, task)
}

func GetPromptLogAnalysisPrompt(c *gin.Context) {
	common.ApiSuccess(c, gin.H{
		"prompt":         service.GetPromptLogAnalysisPromptTemplate(),
		"default_prompt": service.DefaultPromptLogAnalysisPrompt,
	})
}

func UpdatePromptLogAnalysisPrompt(c *gin.Context) {
	var req struct {
		Prompt string `json:"prompt"`
	}
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiError(c, err)
		return
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "analysis prompt cannot be empty",
		})
		return
	}
	if !strings.Contains(prompt, "{{prompt_logs}}") {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "analysis prompt must include {{prompt_logs}}",
		})
		return
	}
	if err := model.UpdateOption("PromptLogAnalysisPrompt", prompt); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"prompt": prompt})
}

func ResetPromptLogAnalysisPrompt(c *gin.Context) {
	if err := model.UpdateOption("PromptLogAnalysisPrompt", ""); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"prompt": service.DefaultPromptLogAnalysisPrompt})
}
