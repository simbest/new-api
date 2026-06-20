/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  TextArea,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { API } from '../../helpers';

const { Text, Title } = Typography;

const PAGE_SIZE = 20;

function formatTime(timestamp) {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleString();
}

function toTimestamp(value) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return undefined;
  return Math.floor(timestamp / 1000);
}

const UsageAnalysis = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    user: '',
    dateRange: [],
  });
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailText, setDetailText] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [analysisTasks, setAnalysisTasks] = useState([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisSubmitting, setAnalysisSubmitting] = useState(false);
  const [analysisPromptVisible, setAnalysisPromptVisible] = useState(false);
  const [analysisPromptLoading, setAnalysisPromptLoading] = useState(false);
  const [analysisPrompt, setAnalysisPrompt] = useState('');
  const [analysisQueueVisible, setAnalysisQueueVisible] = useState(false);
  const [analysisResultVisible, setAnalysisResultVisible] = useState(false);
  const [selectedAnalysisTask, setSelectedAnalysisTask] = useState(null);

  const loadLogs = async (nextPage = page, nextFilters = filters) => {
    const [startTime, endTime] = nextFilters.dateRange || [];
    setLoading(true);
    try {
      const res = await API.get('/api/prompt_log/', {
        params: {
          p: nextPage,
          page_size: PAGE_SIZE,
          user: nextFilters.user?.trim() || undefined,
          start_time: toTimestamp(startTime),
          end_time: toTimestamp(endTime),
        },
      });
      const { success, message, data } = res.data;
      if (!success) {
        Toast.error(message || '加载提示词日志失败');
        return;
      }
      setLogs(data?.items || []);
      setTotal(data?.total || 0);
      setPage(data?.page || nextPage);
    } catch (error) {
      Toast.error('加载提示词日志失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadLogs(1, filters);
  };

  const loadAnalysisTasks = async () => {
    setAnalysisLoading(true);
    try {
      const res = await API.get('/api/prompt_log/analysis', {
        params: {
          p: 1,
          page_size: 20,
        },
      });
      const { success, message, data } = res.data;
      if (!success) {
        Toast.error(message || '加载分析任务失败');
        return;
      }
      setAnalysisTasks(data?.items || []);
    } catch (error) {
      Toast.error('加载分析任务失败');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const submitAnalysis = async () => {
    if (!filters.user?.trim()) {
      Toast.error('请先筛选到单个用户后再提交分析');
      return;
    }
    setAnalysisSubmitting(true);
    try {
      const [startTime, endTime] = filters.dateRange || [];
      const res = await API.post('/api/prompt_log/analysis', null, {
        params: {
          user: filters.user?.trim(),
          start_time: toTimestamp(startTime),
          end_time: toTimestamp(endTime),
        },
      });
      const { success, message } = res.data;
      if (!success) {
        Toast.error(message || '提交分析任务失败');
        return;
      }
      Toast.success('分析任务已加入队列');
      loadAnalysisTasks();
    } catch (error) {
      Toast.error('提交分析任务失败');
    } finally {
      setAnalysisSubmitting(false);
    }
  };

  const openAnalysisPrompt = async () => {
    setAnalysisPromptVisible(true);
    setAnalysisPromptLoading(true);
    try {
      const res = await API.get('/api/prompt_log/analysis/prompt');
      const { success, message, data } = res.data;
      if (!success) {
        Toast.error(message || '加载分析提示词失败');
        return;
      }
      setAnalysisPrompt(data?.prompt || '');
    } catch (error) {
      Toast.error('加载分析提示词失败');
    } finally {
      setAnalysisPromptLoading(false);
    }
  };

  const saveAnalysisPrompt = async () => {
    setAnalysisPromptLoading(true);
    try {
      const res = await API.put('/api/prompt_log/analysis/prompt', {
        prompt: analysisPrompt,
      });
      const { success, message } = res.data;
      if (!success) {
        Toast.error(message || '保存分析提示词失败');
        return;
      }
      Toast.success('分析提示词已保存');
      setAnalysisPromptVisible(false);
    } catch (error) {
      Toast.error('保存分析提示词失败');
    } finally {
      setAnalysisPromptLoading(false);
    }
  };

  const resetAnalysisPrompt = async () => {
    setAnalysisPromptLoading(true);
    try {
      const res = await API.post('/api/prompt_log/analysis/prompt/reset');
      const { success, message, data } = res.data;
      if (!success) {
        Toast.error(message || '恢复默认分析提示词失败');
        return;
      }
      setAnalysisPrompt(data?.prompt || '');
      Toast.success('已恢复默认分析提示词');
    } catch (error) {
      Toast.error('恢复默认分析提示词失败');
    } finally {
      setAnalysisPromptLoading(false);
    }
  };

  const retryAnalysisTask = async (record) => {
    try {
      const res = await API.post(`/api/prompt_log/analysis/${record.id}/retry`);
      const { success, message } = res.data;
      if (!success) {
        Toast.error(message || '重试分析任务失败');
        return;
      }
      Toast.success('分析任务已加入队列');
      loadAnalysisTasks();
    } catch (error) {
      Toast.error('重试分析任务失败');
    }
  };

  const openDetail = async (record) => {
    setSelectedLog(record);
    setDetailVisible(true);
    setDetailText('');
    setDetailLoading(true);
    try {
      const res = await API.get(`/api/prompt_log/${record.id}/content`);
      const { success, message, data } = res.data;
      if (!success) {
        Toast.error(message || '加载提示词详情失败');
        return;
      }
      setDetailText(data?.content_text || '未找到提示词内容。');
    } catch (error) {
      Toast.error('加载提示词详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(1);
    loadAnalysisTasks();
    const timer = setInterval(loadAnalysisTasks, 10000);
    return () => clearInterval(timer);
  }, []);

  const columns = useMemo(
    () => [
      {
        title: 'ID',
        dataIndex: 'id',
        width: 80,
      },
      {
        title: '创建时间',
        dataIndex: 'created_at',
        width: 180,
        render: (value) => formatTime(value),
      },
      {
        title: '用户',
        dataIndex: 'username',
        width: 170,
        render: (_, record) => (
          <Space vertical spacing={0}>
            <Text strong>{record.username || '-'}</Text>
            <Text type='tertiary' size='small'>
              用户 ID: {record.user_id || '-'}
            </Text>
          </Space>
        ),
      },
      {
        title: '模型',
        dataIndex: 'model_name',
        width: 180,
        render: (_, record) => (
          <Space vertical spacing={2}>
            <Text>{record.model_name || '-'}</Text>
            <Tag size='small'>{record.relay_format || '-'}</Tag>
          </Space>
        ),
      },
      {
        title: '提示词预览',
        dataIndex: 'content_preview',
        render: (value) => (
          <Text
            ellipsis={{
              showTooltip: true,
              rows: 2,
            }}
            style={{ maxWidth: 520 }}
          >
            {value || '-'}
          </Text>
        ),
      },
      {
        title: '大小',
        dataIndex: 'content_bytes',
        width: 130,
        render: (_, record) => (
          <Space>
            <Text>{record.content_bytes || 0} B</Text>
            {record.truncated && <Tag color='orange'>已截断</Tag>}
          </Space>
        ),
      },
      {
        title: '请求 ID',
        dataIndex: 'request_id',
        width: 200,
        render: (value) => (
          <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 180 }}>
            {value || '-'}
          </Text>
        ),
      },
      {
        title: '操作',
        width: 90,
        render: (_, record) => (
          <Button size='small' theme='borderless' onClick={() => openDetail(record)}>
            详情
          </Button>
        ),
      },
    ],
    [],
  );

  const analysisColumns = useMemo(
    () => [
      {
        title: '用户',
        dataIndex: 'username',
        width: 170,
        render: (_, record) => (
          <Space vertical spacing={0}>
            <Text strong>{record.username || '-'}</Text>
            <Text type='tertiary' size='small'>
              用户 ID: {record.user_id || '-'}
            </Text>
          </Space>
        ),
      },
      {
        title: '查询时间范围',
        width: 320,
        render: (_, record) =>
          `${formatTime(record.start_time)} - ${formatTime(record.end_time)}`,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 220,
        render: (value, record) => {
          const statusMap = {
            queued: { text: '排队中', color: 'grey' },
            running: { text: '分析中', color: 'blue' },
            succeeded: { text: '已完成', color: 'green' },
            failed: { text: '失败', color: 'red' },
          };
          const status = statusMap[value] || { text: value || '-', color: 'grey' };
          return (
            <Space vertical align='start' spacing={4}>
              <Tag color={status.color}>{status.text}</Tag>
              {record.status === 'succeeded' && (
                <Button
                  size='small'
                  theme='borderless'
                  onClick={() => {
                    setSelectedAnalysisTask(record);
                    setAnalysisResultVisible(true);
                  }}
                >
                  查看结论
                </Button>
              )}
              {record.status === 'failed' && (
                <Space>
                  <Button
                    size='small'
                    theme='borderless'
                    onClick={() => {
                      setSelectedAnalysisTask(record);
                      setAnalysisResultVisible(true);
                    }}
                  >
                    失败原因
                  </Button>
                  <Button size='small' theme='borderless' onClick={() => retryAnalysisTask(record)}>
                    重试
                  </Button>
                </Space>
              )}
            </Space>
          );
        },
      },
      {
        title: '日志数',
        dataIndex: 'prompt_log_count',
        width: 100,
        render: (value) => value || '-',
      },
      {
        title: '创建时间',
        dataIndex: 'created_at',
        width: 180,
        render: (value) => formatTime(value),
      },
      {
        title: '完成时间',
        dataIndex: 'finished_at',
        width: 180,
        render: (value) => formatTime(value),
      },
      {
        title: '操作',
        width: 190,
        render: (_, record) => {
          if (record.status === 'succeeded') {
            return (
              <Button
                size='small'
                theme='borderless'
                onClick={() => {
                  setSelectedAnalysisTask(record);
                  setAnalysisResultVisible(true);
                }}
              >
                查看结论
              </Button>
            );
          }
          if (record.status === 'failed') {
            return (
              <Space>
                <Button
                  size='small'
                  theme='borderless'
                  onClick={() => {
                    setSelectedAnalysisTask(record);
                    setAnalysisResultVisible(true);
                  }}
                >
                  失败原因
                </Button>
                <Button size='small' theme='borderless' onClick={() => retryAnalysisTask(record)}>
                  重试
                </Button>
              </Space>
            );
          }
          return <Text type='tertiary'>-</Text>;
        },
      },
    ],
    [],
  );

  return (
    <div className='mt-[60px] px-2'>
      <Card
        bordered={false}
        title={
          <Space vertical spacing={2}>
            <Title heading={4}>使用分析</Title>
            <Text type='tertiary'>查看已记录的提示词日志和完整内容</Text>
          </Space>
        }
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'end',
            marginBottom: 16,
          }}
        >
          <div style={{ minWidth: 180, flex: '1 1 220px' }}>
            <div style={{ marginBottom: 4 }}>
              <Text type='tertiary' size='small'>
                用户
              </Text>
            </div>
            <Input
              value={filters.user}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, user: value }))
              }
              onEnterPress={handleSearch}
              prefix={<IconSearch />}
              placeholder='用户名或用户 ID'
              showClear
              size='small'
            />
          </div>
          <div style={{ minWidth: 260, flex: '2 1 320px' }}>
            <div style={{ marginBottom: 4 }}>
              <Text type='tertiary' size='small'>
                创建时间
              </Text>
            </div>
            <DatePicker
              value={filters.dateRange}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, dateRange: value || [] }))
              }
              style={{ width: '100%' }}
              type='dateTimeRange'
              placeholder={['起始时间', '截止时间']}
              showClear
              size='small'
            />
          </div>
          <Button
            type='primary'
            icon={<IconSearch />}
            loading={loading}
            onClick={handleSearch}
          >
            查询
          </Button>
          <Button
            type='tertiary'
            loading={analysisSubmitting}
            onClick={submitAnalysis}
          >
            分析
          </Button>
          <Button
            type='tertiary'
            loading={analysisLoading}
            onClick={() => {
              loadAnalysisTasks();
              setAnalysisQueueVisible(true);
            }}
          >
            分析队列
          </Button>
          <Button type='tertiary' onClick={openAnalysisPrompt}>
            分析提示词
          </Button>
        </div>
        <Table
          rowKey='id'
          columns={columns}
          dataSource={logs}
          loading={loading}
          size='small'
          scroll={{ x: 'max-content' }}
          pagination={{
            currentPage: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            onPageChange: (nextPage) => loadLogs(nextPage),
          }}
        />
        <div style={{ marginTop: 20 }}>
          <div className='mb-2 flex items-center justify-between'>
            <Space vertical spacing={0}>
              <Text strong>分析任务</Text>
              <Text type='tertiary' size='small'>
                查看排队中、分析中、已完成和失败的异步分析任务
              </Text>
            </Space>
            <Button
              size='small'
              theme='borderless'
              loading={analysisLoading}
              onClick={loadAnalysisTasks}
            >
              刷新
            </Button>
          </div>
          <Table
            rowKey='id'
            columns={analysisColumns}
            dataSource={analysisTasks}
            loading={analysisLoading}
            size='small'
            scroll={{ x: 'max-content' }}
            pagination={false}
          />
        </div>
      </Card>
      <Modal
        title='提示词详情'
        visible={detailVisible}
        width={800}
        footer={null}
        onCancel={() => setDetailVisible(false)}
      >
        <Space vertical align='start' spacing={8} style={{ width: '100%' }}>
          <Text type='tertiary'>
            日志 ID: {selectedLog?.id || '-'}，请求 ID:{' '}
            {selectedLog?.request_id || '-'}
          </Text>
          <pre
            style={{
              width: '100%',
              minHeight: 360,
              maxHeight: '60vh',
              overflow: 'auto',
              padding: 12,
              borderRadius: 8,
              background: 'var(--semi-color-fill-0)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {detailLoading ? '加载中...' : detailText}
          </pre>
        </Space>
      </Modal>
      <Modal
        title='分析队列'
        visible={analysisQueueVisible}
        width={1100}
        footer={null}
        onCancel={() => setAnalysisQueueVisible(false)}
      >
        <div className='mb-2 flex justify-end'>
          <Button
            size='small'
            theme='borderless'
            loading={analysisLoading}
            onClick={loadAnalysisTasks}
          >
            刷新
          </Button>
        </div>
        <Table
          rowKey='id'
          columns={analysisColumns}
          dataSource={analysisTasks}
          loading={analysisLoading}
          size='small'
          scroll={{ x: 'max-content', y: 520 }}
          pagination={false}
        />
      </Modal>
      <Modal
        title='分析提示词'
        visible={analysisPromptVisible}
        width={900}
        confirmLoading={analysisPromptLoading}
        onOk={saveAnalysisPrompt}
        onCancel={() => setAnalysisPromptVisible(false)}
        okText='保存'
        cancelText='取消'
      >
        <Space vertical align='start' spacing={8} style={{ width: '100%' }}>
          <Text type='tertiary'>
            可用变量：username、user_id、start_time、end_time、log_count、prompt_logs。模板必须包含 {'{{prompt_logs}}'}。
          </Text>
          <TextArea
            value={analysisPrompt}
            onChange={setAnalysisPrompt}
            autosize={{ minRows: 18, maxRows: 24 }}
            disabled={analysisPromptLoading}
          />
          <Button
            type='tertiary'
            size='small'
            loading={analysisPromptLoading}
            onClick={resetAnalysisPrompt}
          >
            恢复默认提示词
          </Button>
        </Space>
      </Modal>
      <Modal
        title='分析结果'
        visible={analysisResultVisible}
        width={900}
        footer={null}
        onCancel={() => setAnalysisResultVisible(false)}
      >
        <Space vertical align='start' spacing={8} style={{ width: '100%' }}>
          <Text type='tertiary'>
            用户：{selectedAnalysisTask?.username || '-'}，起止时间：
            {formatTime(selectedAnalysisTask?.start_time)} -{' '}
            {formatTime(selectedAnalysisTask?.end_time)}，日志数：
            {selectedAnalysisTask?.prompt_log_count || 0}
          </Text>
          <pre
            style={{
              width: '100%',
              minHeight: 420,
              maxHeight: '60vh',
              overflow: 'auto',
              padding: 12,
              borderRadius: 8,
              background: 'var(--semi-color-fill-0)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {selectedAnalysisTask?.analysis_result ||
              selectedAnalysisTask?.error_message ||
              '暂无分析结果。'}
          </pre>
        </Space>
      </Modal>
    </div>
  );
};

export default UsageAnalysis;
