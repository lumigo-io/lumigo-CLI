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

beforeEach(() => {
	mockListQueues.mockReset();
	mockReceiveMessage.mockReset();
	mockSendMessageBatch.mockReset();
	mockDeleteMessageBatch.mockReset();
  
	mockSendMessageBatch.mockReturnValue({
		promise: () => Promise.resolve()
	});
  
	mockDeleteMessageBatch.mockReturnValue({
		promise: () => Promise.resolve()
	});
});

describe("replay-sqs-dlq", () => {
	describe("when the DLQ queue has 2 messages", () => {
		const queueUrl = "https://sqs.us-east-1.amazonaws.com/12345/queue-dev";
		const dlqUrl = "https://sqs.us-east-1.amazonaws.com/12345/queue-dlq-dev";

		beforeEach(() => {
			givenListQueuesReturns([ dlqUrl ]);
			givenListQueuesReturns([ queueUrl ]);
      
			givenReceiveMessageReturns([
				{ MessageId: "1", Body: "message 1" }, 
				{ MessageId: "2", Body: "message 2" }
			]);
			givenReceiveMessageAlwaysReturns([]); // no more messages
		});
    
		test
			.stdout()
			.command(["replay-sqs-dlq", "-n", "queue-dev", "-d", "queue-dlq-dev", "-r", "us-east-1"])
			.it("replays them to the main queue", ctx => {
				expect(ctx.stdout).to.contain("finding the queue [queue-dlq-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain("finding the queue [queue-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain(`replaying events from [${dlqUrl}] to [${queueUrl}] with 10 concurrent pollers`);
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
			.command(["replay-sqs-dlq", "-n", "queue-dev", "-d", "queue-dlq-dev", "-r", "us-east-1", "-k"])
			.it("would not delete the messages from DLQ", ctx => {
				expect(ctx.stdout).to.contain("finding the queue [queue-dlq-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain("finding the queue [queue-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain(`replaying events from [${dlqUrl}] to [${queueUrl}] with 10 concurrent pollers`);
				expect(ctx.stdout).to.contain("all done!");

				expect(mockSendMessageBatch.mock.calls).to.have.lengthOf(1);
				const [sendReq] = mockSendMessageBatch.mock.calls[0];
				expect(sendReq.QueueUrl).to.equal(queueUrl);
				expect(sendReq.Entries).to.have.lengthOf(2);
        
				expect(mockDeleteMessageBatch.mock.calls).to.be.empty;
        
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
