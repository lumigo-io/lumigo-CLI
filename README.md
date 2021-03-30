lumigo-cli
==========

A collection of helpful commands designed to smooth out the development and management of event-based, distributed applications. 
Lumigo-cli also powers the Stackoscope that runs health-check on Serverless environments to detect security, cost, scalability, resilience, and performance issues.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/lumigo-cli.svg)](https://npmjs.org/package/lumigo-cli)
[![Downloads/week](https://img.shields.io/npm/dw/lumigo-cli.svg)](https://npmjs.org/package/lumigo-cli)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![codecov](https://codecov.io/gh/lumigo-io/lumigo-cli/branch/master/graph/badge.svg)](https://codecov.io/gh/lumigo-io/lumigo-cli)
[![CircleCI](https://circleci.com/gh/lumigo-io/lumigo-CLI.svg?style=svg)](https://circleci.com/gh/lumigo-io/lumigo-CLI)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g lumigo-cli
$ lumigo-cli COMMAND
running command...
$ lumigo-cli (-v|--version|version)
lumigo-cli/0.40.1 darwin-x64 node-v14.3.0
$ lumigo-cli --help [COMMAND]
USAGE
  $ lumigo-cli COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`lumigo-cli analyze-lambda-cold-starts`](#lumigo-cli-analyze-lambda-cold-starts)
* [`lumigo-cli analyze-lambda-cost`](#lumigo-cli-analyze-lambda-cost)
* [`lumigo-cli clear-account`](#lumigo-cli-clear-account)
* [`lumigo-cli feedback`](#lumigo-cli-feedback)
* [`lumigo-cli help [COMMAND]`](#lumigo-cli-help-command)
* [`lumigo-cli list-kinesis-shards`](#lumigo-cli-list-kinesis-shards)
* [`lumigo-cli list-kinesis-streams`](#lumigo-cli-list-kinesis-streams)
* [`lumigo-cli list-lambda`](#lumigo-cli-list-lambda)
* [`lumigo-cli measure-lambda-cold-starts`](#lumigo-cli-measure-lambda-cold-starts)
* [`lumigo-cli powertune-lambda`](#lumigo-cli-powertune-lambda)
* [`lumigo-cli replay-sqs-dlq`](#lumigo-cli-replay-sqs-dlq)
* [`lumigo-cli s3-select-batch`](#lumigo-cli-s3-select-batch)
* [`lumigo-cli scanner`](#lumigo-cli-scanner)
* [`lumigo-cli send-to-sns`](#lumigo-cli-send-to-sns)
* [`lumigo-cli send-to-sqs`](#lumigo-cli-send-to-sqs)
* [`lumigo-cli sls-remove`](#lumigo-cli-sls-remove)
* [`lumigo-cli switch-profile`](#lumigo-cli-switch-profile)
* [`lumigo-cli tail-cloudwatch-events-bus`](#lumigo-cli-tail-cloudwatch-events-bus)
* [`lumigo-cli tail-cloudwatch-events-rule`](#lumigo-cli-tail-cloudwatch-events-rule)
* [`lumigo-cli tail-cloudwatch-logs`](#lumigo-cli-tail-cloudwatch-logs)
* [`lumigo-cli tail-dynamodb`](#lumigo-cli-tail-dynamodb)
* [`lumigo-cli tail-eventbridge-bus`](#lumigo-cli-tail-eventbridge-bus)
* [`lumigo-cli tail-eventbridge-rule`](#lumigo-cli-tail-eventbridge-rule)
* [`lumigo-cli tail-kinesis`](#lumigo-cli-tail-kinesis)
* [`lumigo-cli tail-sns`](#lumigo-cli-tail-sns)
* [`lumigo-cli tail-sqs`](#lumigo-cli-tail-sqs)
* [`lumigo-cli whoami`](#lumigo-cli-whoami)

## `lumigo-cli analyze-lambda-cold-starts`

Analyze Lambda functions cold starts in ALL regions

```
USAGE
  $ lumigo-cli analyze-lambda-cold-starts

OPTIONS
  -d, --days=days        only find cold starts in the last X days
  -h, --hours=hours      only find cold starts in the last X hours
  -m, --minutes=minutes  [default: 60] only find cold starts in the last X minutes
  -n, --name=name        only analyze this function, e.g. hello-world
  -p, --profile=profile  AWS CLI profile name
  -r, --region=region    only include functions in an AWS region, e.g. us-east-1
  --httpProxy=httpProxy  URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/analyze-lambda-cold-starts.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/analyze-lambda-cold-starts.js)_

## `lumigo-cli analyze-lambda-cost`

Analyze Lambda functions costs in ALL regions

```
USAGE
  $ lumigo-cli analyze-lambda-cost

OPTIONS
  -d, --days=days        analyze lambda cost for the last X days
  -n, --name=name        only analyze this function, e.g. hello-world
  -p, --profile=profile  AWS CLI profile name
  -r, --region=region    only include functions in an AWS region, e.g. us-east-1
  --httpProxy=httpProxy  URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/analyze-lambda-cost.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/analyze-lambda-cost.js)_

## `lumigo-cli clear-account`

Clear your AWS account from all supported resources. Use with cautious!

```
USAGE
  $ lumigo-cli clear-account

OPTIONS
  -f, --force            Skip prompt. Use mainly in CI/CD environments
  -p, --profile=profile  AWS CLI profile name
  -r, --retries=retries  [default: 2] How many times to try to delete stubborn resource
  --httpProxy=httpProxy  URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/clear-account.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/clear-account.js)_

## `lumigo-cli feedback`

Suggest feature or report bug

```
USAGE
  $ lumigo-cli feedback

OPTIONS
  -d, --description=description  issue description
  -s, --subject=subject          (required) issue title
  -t, --type=feature|bug         (required) feedback type
```

_See code: [src/commands/feedback.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/feedback.js)_

## `lumigo-cli help [COMMAND]`

display help for lumigo-cli

```
USAGE
  $ lumigo-cli help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.2.1/src/commands/help.ts)_

## `lumigo-cli list-kinesis-shards`

Lists the shards of a Kinesis stream

```
USAGE
  $ lumigo-cli list-kinesis-shards

OPTIONS
  -n, --streamName=streamName  (required) name of the Kinesis stream, e.g. event-stream-dev
  -p, --profile=profile        AWS CLI profile name
  -r, --region=region          (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy        http/https proxy (when running in a corporate network)
```

_See code: [src/commands/list-kinesis-shards.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/list-kinesis-shards.js)_

## `lumigo-cli list-kinesis-streams`

Lists the Kinesis streams

```
USAGE
  $ lumigo-cli list-kinesis-streams

OPTIONS
  -p, --profile=profile  AWS CLI profile name
  -r, --region=region    AWS region, e.g. us-east-1
  --httpProxy=httpProxy  URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/list-kinesis-streams.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/list-kinesis-streams.js)_

## `lumigo-cli list-lambda`

List Lambda functions in ALL regions

```
USAGE
  $ lumigo-cli list-lambda

OPTIONS
  -i, --inactive         only include functions that are inactive for 30 days
  -p, --profile=profile  AWS CLI profile name
  -r, --region=region    only include functions in an AWS region, e.g. us-east-1
  --httpProxy=httpProxy  URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/list-lambda.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/list-lambda.js)_

## `lumigo-cli measure-lambda-cold-starts`

Measures a function's cold start duration (i.e. duration + initDuration)

```
USAGE
  $ lumigo-cli measure-lambda-cold-starts

OPTIONS
  -e, --payload=payload            [default: {}] the JSON payload to send to the function
  -f, --file=file                  file that contains the JSON payload to send to the function
  -i, --invocations=invocations    [default: 100] the number of invocations to run for each configuration
  -n, --functionName=functionName  (required) name of the Lambda function
  -p, --profile=profile            AWS CLI profile name
  -r, --region=region              (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy            URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/measure-lambda-cold-starts.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/measure-lambda-cold-starts.js)_

## `lumigo-cli powertune-lambda`

Powertunes a Lambda function for cost or speed

```
USAGE
  $ lumigo-cli powertune-lambda

OPTIONS
  -e, --payload=payload                  [default: {}] the JSON payload to send to the function
  -f, --file=file                        file that contains the JSON payload to send to the function
  -i, --invocations=invocations          [default: 100] the number of invocations to run for each configuration
  -n, --functionName=functionName        (required) name of the Lambda function
  -o, --outputFile=outputFile            output file for the powertune SAR response
  -p, --profile=profile                  AWS CLI profile name
  -r, --region=region                    (required) AWS region, e.g. us-east-1
  -s, --strategy=cost|speed|balanced     (required) what to powertune the function for - "cost", "speed" or "balanced"
  -v, --powerValues=powerValues          comma-separated list of power values to be tested, e.g. 128,256,512,1024

  -w, --balancedWeight=balancedWeight    the trade-off between cost and time, 0.0 is equivalent to "speed" strategy, 1.0
                                         is equivalent to "cost" strategy

  -z, --noVisualization                  suppresses the prompt to show visualization

  --autoOptimize                         if true, apply the optimal configuration at the end of its execution

  --autoOptimizeAlias=autoOptimizeAlias  the state machine will create or update this alias with the new optimal power
                                         value

  --httpProxy=httpProxy                  URL of the http/https proxy (when running in a corporate network)

  --parallelInvocation                   run invocations in parallel
```

_See code: [src/commands/powertune-lambda.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/powertune-lambda.js)_

## `lumigo-cli replay-sqs-dlq`

Replays the messages in a SQS DLQ back to the main queue

```
USAGE
  $ lumigo-cli replay-sqs-dlq

OPTIONS
  -c, --concurrency=concurrency     [default: 10] how many concurrent pollers to run
  -d, --dlqQueueName=dlqQueueName   (required) name of the SQS DLQ queue, e.g. task-queue-dlq-dev
  -k, --keep                        whether to keep the replayed messages in the DLQ
  -n, --targetName=targetName       (required) name of the target SQS queue/SNS topic, e.g. task-queue-dev
  -p, --profile=profile             AWS CLI profile name
  -r, --region=region               (required) AWS region, e.g. us-east-1
  -t, --targetType=SQS|SNS|Kinesis  [default: SQS] valid values are SQS [default], SNS, and Kinesis
  --httpProxy=httpProxy             URL of the http/https proxy (when running in a corporate network)
  --targetProfile=targetProfile     AWS CLI profile name to use for the target account
  --targetRegion=targetRegion       AWS region for the target resource, e.g. eu-west-1
```

_See code: [src/commands/replay-sqs-dlq.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/replay-sqs-dlq.js)_

## `lumigo-cli s3-select-batch`

Runs S3 Select on a batch of S3 objects, e.g. by prefix

```
USAGE
  $ lumigo-cli s3-select-batch

OPTIONS
  -b, --bucket=bucket                  (required) name of the S3 bucket
  -c, --concurrency=concurrency        [default: 10] how many concurrent S3 Select operations to run
  -e, --expression=expression          (required) the expression used to query each object
  -f, --fileType=CSV|JSON|Parquet      (required) What format are the files in? CSV, JSON, or Parquet
  -o, --outputFile=outputFile          output filename, if omitted, records would be printed in the console
  -p, --profile=profile                AWS CLI profile name
  -r, --region=region                  (required) AWS region, e.g. us-east-1
  -x, --prefix=prefix                  (required) object prefix
  --compressionType=(NONE|GZIP|BZIP2)  [default: NONE] the objects' compression format - NONE, GZIP or BZIP2
  --csvConfig=csvConfig                [default: {}] JSON config on how to parse CSV files
  --httpProxy=httpProxy                URL of the http/https proxy (when running in a corporate network)
  --jsonConfig=jsonConfig              [default: {"Type": "DOCUMENT"}] JSON config on how to parse JSON files
  --outputCsvConfig=outputCsvConfig    [default: {}] JSON config on how to format the output file in CSV
  --outputJsonConfig=outputJsonConfig  [default: {}] JSON config on how to format the output file in JSON
```

_See code: [src/commands/s3-select-batch.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/s3-select-batch.js)_

## `lumigo-cli scanner`

Use Lumigo Stackoscope to scan your AWS account and suggest improvements

```
USAGE
  $ lumigo-cli scanner

OPTIONS
  -p, --profile=profile  AWS CLI profile name
  --httpProxy=httpProxy  URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/scanner.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/scanner.js)_

## `lumigo-cli send-to-sns`

Sends each line in the specified file as a message to a SNS topic

```
USAGE
  $ lumigo-cli send-to-sns

OPTIONS
  -c, --concurrency=concurrency  [default: 10] how many concurrent pollers to run
  -f, --filePath=filePath        (required) path to the file
  -n, --topicName=topicName      (required) name of the SNS topic, e.g. my-topic-dev
  -p, --profile=profile          AWS CLI profile name
  -r, --region=region            (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy          URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/send-to-sns.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/send-to-sns.js)_

## `lumigo-cli send-to-sqs`

Sends each line in the specified file as a message to a SQS queue

```
USAGE
  $ lumigo-cli send-to-sqs

OPTIONS
  -f, --filePath=filePath    (required) path to the file
  -n, --queueName=queueName  (required) name of the SQS queue, e.g. task-queue-dev
  -p, --profile=profile      AWS CLI profile name
  -r, --region=region        (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy      URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/send-to-sqs.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/send-to-sqs.js)_

## `lumigo-cli sls-remove`

Deletes a CloudFormation stack that was generated by the Serverless framework

```
USAGE
  $ lumigo-cli sls-remove

OPTIONS
  -e, --emptyS3Buckets       empty all S3 buckets that are part of the stack
  -n, --stackName=stackName  (required) name of the CloudFormation stack, e.g. hello-world-dev
  -p, --profile=profile      AWS CLI profile name
  -r, --region=region        (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy      URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/sls-remove.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/sls-remove.js)_

## `lumigo-cli switch-profile`

Switch AWS profiles

```
USAGE
  $ lumigo-cli switch-profile
```

_See code: [src/commands/switch-profile.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/switch-profile.js)_

## `lumigo-cli tail-cloudwatch-events-bus`

Tail a CloudWatch Events bus

```
USAGE
  $ lumigo-cli tail-cloudwatch-events-bus

OPTIONS
  -n, --eventBusName=eventBusName  name of the CloudWatch Events bus, if omitted, then the default bus is used
  -p, --profile=profile            AWS CLI profile name
  -r, --region=region              (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy            URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/tail-cloudwatch-events-bus.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/tail-cloudwatch-events-bus.js)_

## `lumigo-cli tail-cloudwatch-events-rule`

Tail a CloudWatch Events rule

```
USAGE
  $ lumigo-cli tail-cloudwatch-events-rule

OPTIONS
  -b, --eventBusName=eventBusName  name of the CloudWatch Events bus
  -n, --ruleName=ruleName          (required) name of the CloudWatch Events rule
  -p, --profile=profile            AWS CLI profile name
  -r, --region=region              (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy            URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/tail-cloudwatch-events-rule.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/tail-cloudwatch-events-rule.js)_

## `lumigo-cli tail-cloudwatch-logs`

Tail a CloudWatch Log Group

```
USAGE
  $ lumigo-cli tail-cloudwatch-logs

OPTIONS
  -f, --filterPattern=filterPattern  filter pattern for the logs, see
                                     https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.htm
                                     l

  -i, --interval=interval            [default: 1000] interval (ms) for polling CloudWatch Logs

  -n, --namePrefix=namePrefix        (required) name prefix of the log group, e.g. /aws/lambda/workshop-dev-

  -p, --profile=profile              AWS CLI profile name

  -r, --region=region                (required) AWS region, e.g. us-east-1

  --httpProxy=httpProxy              URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/tail-cloudwatch-logs.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/tail-cloudwatch-logs.js)_

## `lumigo-cli tail-dynamodb`

Tails the records going into a DynamoDB stream

```
USAGE
  $ lumigo-cli tail-dynamodb

OPTIONS
  -e, --endpoint=endpoint    DynamoDB endpoint (for when using dynamodb-local)
  -n, --tableName=tableName  (required) name of the DynamoDB table, e.g. users-dev
  -p, --profile=profile      AWS CLI profile name
  -r, --region=region        (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy      URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/tail-dynamodb.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/tail-dynamodb.js)_

## `lumigo-cli tail-eventbridge-bus`

Tail an EventBridge bus

```
USAGE
  $ lumigo-cli tail-eventbridge-bus

OPTIONS
  -n, --eventBusName=eventBusName  name of the EventBridge bus, if omitted, then the default bus is used
  -p, --profile=profile            AWS CLI profile name
  -r, --region=region              (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy            URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/tail-eventbridge-bus.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/tail-eventbridge-bus.js)_

## `lumigo-cli tail-eventbridge-rule`

Tail an EventBridge rule

```
USAGE
  $ lumigo-cli tail-eventbridge-rule

OPTIONS
  -b, --eventBusName=eventBusName  name of the EventBridge bus
  -n, --ruleName=ruleName          (required) name of the EventBridge rule
  -p, --profile=profile            AWS CLI profile name
  -r, --region=region              (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy            URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/tail-eventbridge-rule.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/tail-eventbridge-rule.js)_

## `lumigo-cli tail-kinesis`

Tails the records going into a Kinesis stream

```
USAGE
  $ lumigo-cli tail-kinesis

OPTIONS
  -n, --streamName=streamName  (required) name of the Kinesis stream, e.g. event-stream-dev
  -p, --profile=profile        AWS CLI profile name
  -r, --region=region          (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy        URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/tail-kinesis.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/tail-kinesis.js)_

## `lumigo-cli tail-sns`

Tails the messages going into a SNS topic

```
USAGE
  $ lumigo-cli tail-sns

OPTIONS
  -n, --topicName=topicName  (required) name of the SNS topic, e.g. task-topic-dev
  -p, --profile=profile      AWS CLI profile name
  -r, --region=region        (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy      URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/tail-sns.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/tail-sns.js)_

## `lumigo-cli tail-sqs`

Tails the messages going into a SQS queue

```
USAGE
  $ lumigo-cli tail-sqs

OPTIONS
  -n, --queueName=queueName  (required) name of the SQS queue, e.g. task-queue-dev
  -p, --profile=profile      AWS CLI profile name
  -r, --region=region        (required) AWS region, e.g. us-east-1
  --httpProxy=httpProxy      URL of the http/https proxy (when running in a corporate network)
```

_See code: [src/commands/tail-sqs.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/tail-sqs.js)_

## `lumigo-cli whoami`

See your current AWS profile name

```
USAGE
  $ lumigo-cli whoami
```

_See code: [src/commands/whoami.js](https://github.com/lumigo-io/lumigo-cli/blob/v0.40.1/src/commands/whoami.js)_
<!-- commandsstop -->
