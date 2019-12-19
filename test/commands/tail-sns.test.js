const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");
const Promise = require("bluebird");

const mockListTopics = jest.fn();
AWS.SNS.prototype.listTopics = mockListTopics;
const mockSubscribe = jest.fn();
AWS.SNS.prototype.subscribe = mockSubscribe;
const mockUnsubscribe = jest.fn();
AWS.SNS.prototype.unsubscribe = mockUnsubscribe;
const mockCreateQueue = jest.fn();
AWS.SQS.prototype.createQueue = mockCreateQueue;
const mockDeleteQueue = jest.fn();
AWS.SQS.prototype.deleteQueue = mockDeleteQueue;
const mockDeleteMessageBatch = jest.fn();
AWS.SQS.prototype.deleteMessageBatch = mockDeleteMessageBatch;
const mockReceiveMessage = jest.fn();
AWS.SQS.prototype.receiveMessage = mockReceiveMessage;

const mockOpenStdin = jest.fn();
process.openStdin = mockOpenStdin;
process.stdin.setRawMode = jest.fn();

beforeEach(() => {
	mockListTopics.mockReset();
	mockSubscribe.mockReset();
	mockUnsubscribe.mockReset();
	mockOpenStdin.mockReset();
	mockCreateQueue.mockReset();
	mockDeleteQueue.mockReset();
	mockDeleteMessageBatch.mockReset();
  
	mockCreateQueue.mockReturnValue({
		promise: () => Promise.resolve({
			QueueUrl: "https://sqs.us-east-1.amazonaws.com/12345/test"
		})
	});
  
	mockDeleteQueue.mockReturnValue({
		promise: () => Promise.resolve()
	});
  
	mockDeleteMessageBatch.mockReturnValue({
		promise: () => Promise.resolve()
	});
  
	mockSubscribe.mockReturnValue({
		promise: () => Promise.resolve({
			SubscriptionArn: "subscription-arn"
		})
	});
  
	mockUnsubscribe.mockReturnValue({
		promise: () => Promise.resolve()
	});
  
	mockOpenStdin.mockReturnValue({
		once: (_event, cb) => Promise.delay(1000).then(cb)
	});
});

describe("tail-sns", () => {
	describe("when the SNS topic doesn't exist", () => {
		beforeEach(() => {
			givenListTopicsReturns(["your-topic-dev"], true);
			givenListTopicsReturns(["another-topic-dev"]);
		});
    
		test
			.stdout()
			.command(["tail-sns", "-n", "my-topic-dev", "-r", "us-east-1"])
			.catch((err) => {
				expect(err.message).to.equal("cannot find the SNS topic [my-topic-dev]!");
			})
			.it("fetches all topics and then error", ctx => {
				expect(ctx.stdout).to.contain("finding the topic [my-topic-dev] in [us-east-1]");
			});
	});
  
	describe("when the SNS topic exists", () => {
		beforeEach(() => {
			givenListTopicsReturns(["my-topic-dev"]);
			givenReceiveMessageReturns([{
				MessageId: "1",
				ReceiptHandle: "1",
				Body: JSON.stringify({
					Subject: "my test message",
					Message: "message 1"          
				})
			}]);      
			givenReceiveMessageAlwaysReturns([]);
		});
    
		test
			.stdout()
			.command(["tail-sns", "-n", "my-topic-dev", "-r", "us-east-1"])
			.it("fetches and prints the messages", (ctx) => {
				expect(ctx.stdout).to.contain("my test message");
				expect(ctx.stdout).to.contain("message 1");
			});
	});
});

function givenListTopicsReturns(topicArns, hasMore = false) {
	mockListTopics.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Topics: topicArns.map(x => ({ TopicArn: `arn:aws:sns:us-east-1:12345:${x}` })),
			NextToken: hasMore ? "token" : undefined
		})
	});
}

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
