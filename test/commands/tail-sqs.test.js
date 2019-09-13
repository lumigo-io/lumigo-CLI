const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");

const mockListQueues = jest.fn();
AWS.SQS.prototype.listQueues = mockListQueues;
const mockReceiveMessage = jest.fn();
AWS.SQS.prototype.receiveMessage = mockReceiveMessage;

const consoleLog = jest.fn();
console.log = consoleLog;

beforeEach(() => {
	mockListQueues.mockReset();
	mockReceiveMessage.mockReset();
});

describe("tail-sqs", () => {
	describe("when there are multiple queues with same prefix", () => {
		beforeEach(() => {
			givenListQueuesReturns([
				"https://sqs.us-east-1.amazonaws.com/12345/queue-dev",
				"https://sqs.us-east-1.amazonaws.com/12345/queue-dev-dlq"
			]);
      
			givenReceiveMessageReturns([]);
			givenReceiveMessageFails(); // force the command to exit
		});
    
		test
			.stdout()
			.command(["tail-sqs", "-n", "queue-dev", "-r", "us-east-1"])
			.catch(() => {})
			.it("finds the right one", ctx => {				
				expect(ctx.stdout).to.contain("finding the queue [queue-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain("polling SQS queue [https://sqs.us-east-1.amazonaws.com/12345/queue-dev]...");
			});
	});
  
	describe("when the queue has two messages", () => {
		beforeEach(() => {
			givenListQueuesReturns([
				"https://sqs.us-east-1.amazonaws.com/12345/queue-dev"
			]);
      
			givenReceiveMessageReturns([{
				MessageId: "1",
				Body: "message 1"
			}, {
				MessageId: "2",
				Body: "message 2"
			}]);
			givenReceiveMessageFails(); // force the command to exit
		});
    
		test
			.stdout()
			.command(["tail-sqs", "-n", "queue-dev", "-r", "us-east-1"])
			.catch(() => {})
			.it("displays them in the console", ctx => {
				expect(ctx.stdout).to.contain("finding the queue [queue-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain("polling SQS queue [https://sqs.us-east-1.amazonaws.com/12345/queue-dev]...");      

				// unfortunately, ctx.stdout doesn't seem to capture the messages published by console.log
				// hence this workaround...
				expect(consoleLog.mock.calls).to.have.lengthOf(2);
				const [msg1, msg2] = consoleLog.mock.calls;
				expect(msg1[0]).to.equal("message 1");
				expect(msg2[0]).to.equal("message 2");
			});
	});
  
	describe("when messages are visible again after timeout", () => {
		beforeEach(() => {
			givenListQueuesReturns([
				"https://sqs.us-east-1.amazonaws.com/12345/queue-dev"
			]);
      
			const messages = [{
				MessageId: "1",
				Body: "message 1"
			}, {
				MessageId: "2",
				Body: "message 2"
			}];
      
			givenReceiveMessageReturns(messages); // received the messages the first time
			givenReceiveMessageReturns(messages); // received them again, but they should not be shown again
			givenReceiveMessageFails(); // force the command to exit
		});
    
		test
			.stdout()
			.command(["tail-sqs", "-n", "queue-dev", "-r", "us-east-1"])
			.catch(() => {})
			.it("do not show them again", ctx => {
				expect(ctx.stdout).to.contain("finding the queue [queue-dev] in [us-east-1]");
				expect(ctx.stdout).to.contain("polling SQS queue [https://sqs.us-east-1.amazonaws.com/12345/queue-dev]...");      

				// unfortunately, ctx.stdout doesn't seem to capture the messages published by console.log
				// hence this workaround...
				expect(consoleLog.mock.calls).to.have.lengthOf(2); // note: this is 2 instead of 4
				const [msg1, msg2] = consoleLog.mock.calls;
				expect(msg1[0]).to.equal("message 1");
				expect(msg2[0]).to.equal("message 2");
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

function givenReceiveMessageFails() {
	mockReceiveMessage.mockReturnValueOnce({
		promise: () => Promise.reject(new Error("boom"))
	});
};
