#!/bin/bash

PROJECT_ID="genie-ai-1ca85"
DASHBOARD_JSON="dashboard.json"

echo "📊 Creating Genie Operation Dashboard for project: $PROJECT_ID..."

cat <<EOF > $DASHBOARD_JSON
{
  "displayName": "Genie AI Operations",
  "gridLayout": {
    "columns": "2",
    "widgets": [
      {
        "title": "Tasks in Queue (Depth)",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"cloudtasks.googleapis.com/queue/depth\" resource.type=\"cloud_tasks_queue\" resource.label.\"queue_id\"=\"genie-worker-queue\"",
                  "aggregation": {
                    "perSeriesAligner": "ALIGN_MEAN",
                    "crossSeriesReducer": "REDUCE_MEAN",
                    "groupByFields": []
                  }
                },
                "unitOverride": "1"
              },
              "plotType": "LINE",
              "minAlignmentPeriod": "60s"
            }
          ],
          "timeshiftDuration": "0s",
          "yAxis": {
            "label": "y1Axis",
            "scale": "LINEAR"
          }
        }
      },
      {
        "title": "Worker Executions (Success vs Error)",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"cloudfunctions.googleapis.com/function/execution_count\" resource.type=\"cloud_function\" resource.label.\"function_name\"=\"genie-worker\"",
                  "aggregation": {
                    "perSeriesAligner": "ALIGN_RATE",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": [
                      "metric.label.\"status\""
                    ]
                  }
                }
              },
              "plotType": "STACKED_BAR",
              "minAlignmentPeriod": "60s"
            }
          ],
          "timeshiftDuration": "0s",
          "yAxis": {
            "label": "y1Axis",
            "scale": "LINEAR"
          }
        }
      },
      {
        "title": "Active Task Attempts",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"cloudtasks.googleapis.com/queue/task_attempt_count\" resource.type=\"cloud_tasks_queue\" resource.label.\"queue_id\"=\"genie-worker-queue\"",
                   "aggregation": {
                    "perSeriesAligner": "ALIGN_RATE",
                    "crossSeriesReducer": "REDUCE_SUM"
                  }
                }
              },
              "plotType": "LINE",
              "minAlignmentPeriod": "60s"
            }
          ]
        }
      }
    ]
  }
}
EOF

gcloud monitoring dashboards create --config-from-file=$DASHBOARD_JSON --project=$PROJECT_ID
rm $DASHBOARD_JSON

echo "✅ Dashboard created! View it here:"
echo "https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
