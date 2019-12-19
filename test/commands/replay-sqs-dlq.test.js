const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");

const mockListQueues = jest.fn();
AWS.SQS.prototype.listQueues = mockListQueues;
const mockReceiveMessage = jest.fn();
AWS.SQS.prototype.receiveMessage = mockReceiveMessage;
const mockSendMessageBatch = jest.fn();
AWS.SQS.prototype.sendMessageBatch = mockSendMessageBatch;
const mockDeleteMessageBatch = jest.fn();
AWS.SQS.prototype.deleteMessageBatch = mockDeleteMessageBatch;
const mockPublish = jest.fn();
AWS.SNS.prototype.publish = mockPublish;
const mockListTopics = jest.fn();
AWS.SNS.prototype.listTopics = mockListTopics;
const mockPutRecords = jest.fn();
AWS.Kinesis.prototype.putRecords = mockPutRecords;

beforeEach(() => {
	mockListQueues.mockReset();
	mockReceiveMessage.mockReset();
	mockSendMessageBatch.mockReset();
	mockDeleteMessageBatch.mockReset();
	mockPublish.mockReset();
	mockPutRecords.mockReset();
  
	mockSendMessageBatch.mockReturnValue({
		promise: () => Promise.resolve()
	});
  
	mockDeleteMessageBatch.mockReturnValue({
		promise: () => Promise.resolve()
	});
  
	mockPublish.mockReturnValue({
		promise: () => Promise.resolve()
	});
  
	mockPutRecords.mockReturnValue({
		promise: () => Promise.resolve()
	});
});

const commandArgs = [
	"replay-sqs-dlq", "-n", "queue-dev", "-d", "queue-dlq-dev", "-r", "us-east-1"
];

describe("replay-sqs-dlq", () => {
	describe("when the DLQ queue has 2 messages", () => {
		const dlqUrl = "https://sqs.us-east-1.amazonaws.com/12345/queue-dlq-dev";
		const queueUrl = "https://sqs.us-east-1.amazonaws.com/12345/queue-dev";
		const topicArn = "arn:aws:sns:us-east-1:12345:queue-dev";

		beforeEach(() => {
			givenListQueuesReturns([ dlqUrl ]);
			givenListQueuesReturns([ queueUrl ]);
			givenListTopicReturns([ topicArn ]);
      
			givenReceiveMessageReturns([
				{ MessageId: "1", Body: "message 1" }, 
				{ MessageId: "2", Body: "message 2" }
			]);
			givenReceiveMessageAlwaysReturns([]); // no more messages
		});
    
		test
			.stdout()
			.command(commandArgs)
			.it("replays them to the main SQS queue", ctx => {
				expect(ctx.stdout).to.contain("finding the SQS DLQ [queue-dlq-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain("finding the SQS queue [queue-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain(`replaying events from [${dlqUrl}] to [SQS:queue-dev] with 10 concurrent pollers`);
				expect(ctx.stdout).to.contain("all done!");

				expect(mockSendMessageBatch.mock.calls).to.have.lengthOf(1);
				const [sendReq] = mockSendMessageBatch.mock.calls[0];
				expect(sendReq.QueueUrl).to.equal(queueUrl);
				expect(sendReq.Entries).to.have.lengthOf(2);
        
				expect(mockDeleteMessageBatch.mock.calls).to.have.lengthOf(1);
				const [delReq] = mockDeleteMessageBatch.mock.calls[0];
				expect(delReq.QueueUrl).to.equal(dlqUrl);
				expect(delReq.Entries).to.have.lengthOf(2);
        
				// 10 poller * 10 empty receives + 1 non-empty receive = 101 calls
				expect(mockReceiveMessage.mock.calls).to.have.lengthOf(101);
			});
      
		test
			.stdout()
			.command([...commandArgs, "-k"])
			.it("would not delete the messages from DLQ", ctx => {
				expect(ctx.stdout).to.contain("finding the SQS DLQ [queue-dlq-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain("finding the SQS queue [queue-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain(`replaying events from [${dlqUrl}] to [SQS:queue-dev] with 10 concurrent pollers`);
				expect(ctx.stdout).to.contain("all done!");

				expect(mockSendMessageBatch.mock.calls).to.have.lengthOf(1);
				const [sendReq] = mockSendMessageBatch.mock.calls[0];
				expect(sendReq.QueueUrl).to.equal(queueUrl);
				expect(sendReq.Entries).to.have.lengthOf(2);
        
				expect(mockDeleteMessageBatch.mock.calls).to.be.empty;
        
				// 10 poller * 10 empty receives + 1 non-empty receive = 101 calls
				expect(mockReceiveMessage.mock.calls).to.have.lengthOf(101);
			});
      
		test
			.stdout()
			.command([...commandArgs, "-t", "SNS"])
			.it("replays them to a SNS topic", ctx => {
				expect(ctx.stdout).to.contain("finding the SQS DLQ [queue-dlq-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain("finding the SNS topic [queue-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain(`replaying events from [${dlqUrl}] to [SNS:queue-dev] with 10 concurrent pollers`);
				expect(ctx.stdout).to.contain("all done!");

				expect(mockPublish.mock.calls).to.have.lengthOf(2);
				mockSendMessageBatch.mock.calls.forEach(([ req ]) => {
					expect(req.TopicArn).to.equal(topicArn);
					expect(req.Message).to.match("message ");
				});
        
				expect(mockDeleteMessageBatch.mock.calls).to.have.lengthOf(1);
				const [delReq] = mockDeleteMessageBatch.mock.calls[0];
				expect(delReq.QueueUrl).to.equal(dlqUrl);
				expect(delReq.Entries).to.have.lengthOf(2);
        
				// 10 poller * 10 empty receives + 1 non-empty receive = 101 calls
				expect(mockReceiveMessage.mock.calls).to.have.lengthOf(101);
			});
      
		test
			.stdout()
			.command([...commandArgs, "-t", "Kinesis"])
			.it("replays them to a Kinesis stream", ctx => {
				expect(ctx.stdout).to.contain("finding the SQS DLQ [queue-dlq-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain(`replaying events from [${dlqUrl}] to [Kinesis:queue-dev] with 10 concurrent pollers`);
				expect(ctx.stdout).to.contain("all done!");

				expect(mockPutRecords.mock.calls).to.have.lengthOf(1);
				const [req] = mockPutRecords.mock.calls[0];
				expect(req.StreamName).to.equal("queue-dev");
				expect(req.Records).to.have.length(2);
        
				expect(mockDeleteMessageBatch.mock.calls).to.have.lengthOf(1);
				const [delReq] = mockDeleteMessageBatch.mock.calls[0];
				expect(delReq.QueueUrl).to.equal(dlqUrl);
				expect(delReq.Entries).to.have.lengthOf(2);
        
				// 10 poller * 10 empty receives + 1 non-empty receive = 101 calls
				expect(mockReceiveMessage.mock.calls).to.have.lengthOf(101);
			});
	});
});

function givenListQueuesReturns(queueUrls) {
	mockListQueues.mockReturnValueOnce({
		promise: () => Promise.resolve({
			QueueUrls: queueUrls
		})
	});
};

function givenReceiveMessageReturns(messages) {
	mockReceiveMessage.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Messages: messages
		})
	});
};

function givenReceiveMessageAlwaysReturns(messages) {
	mockReceiveMessage.mockReturnValue({
		promise: () => Promise.resolve({
			Messages: messages
		})
	});
};

function givenListTopicReturns(topicArns) {
	mockListTopics.mockReturnValue({
		promise: () => Promise.resolve({
			Topics: topicArns.map(x => ({
				TopicArn: x
			}))
		})
	});
}
