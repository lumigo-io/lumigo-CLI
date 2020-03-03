const { expect, test } = require("@oclif/test");
const AWS = require("aws-sdk");
const Promise = require("bluebird");

const mockListQueues = jest.fn();
AWS.SQS.prototype.listQueues = mockListQueues;
const mockReceiveMessage = jest.fn();
AWS.SQS.prototype.receiveMessage = mockReceiveMessage;
const mockOpenStdin = jest.fn();
process.openStdin = mockOpenStdin;
process.stdin.setRawMode = jest.fn();

beforeEach(() => {
	mockOpenStdin.mockReturnValue({
		once: (_event, cb) => Promise.delay(1000).then(cb)
	});
});

afterEach(() => {
	mockListQueues.mockReset();
	mockReceiveMessage.mockReset();
	mockOpenStdin.mockReset();
});

describe("tail-sqs", () => {
	describe("when there are multiple queues with same prefix", () => {
		beforeEach(() => {
			givenListQueuesReturns([
				"https://sqs.us-east-1.amazonaws.com/12345/queue-dev",
				"https://sqs.us-east-1.amazonaws.com/12345/queue-dev-dlq"
			]);

			givenReceiveMessageAlwaysReturns([]);
		});

		test.stdout()
			.command(["tail-sqs", "-n", "queue-dev", "-r", "us-east-1"])
			.exit(0)
			.it("finds the right one", ctx => {
				expect(ctx.stdout).to.contain(
					"finding the queue [queue-dev] in [us-east-1]"
				);
				expect(ctx.stdout).to.contain(
					"polling SQS queue [https://sqs.us-east-1.amazonaws.com/12345/queue-dev]..."
				);
			});
	});

	describe("when the queue has two messages", () => {
		beforeEach(() => {
			givenListQueuesReturns([
				"https://sqs.us-east-1.amazonaws.com/12345/queue-dev"
			]);

			givenReceiveMessageReturns([
				{
					MessageId: "1",
					Body: "message 1"
				},
				{
					MessageId: "2",
					Body: "message 2"
				}
			]);
			givenReceiveMessageAlwaysReturns([]);
		});

		test.stdout()
			.command(["tail-sqs", "-n", "queue-dev", "-r", "us-east-1"])
			.exit(0)
			.it("displays them in the console", ctx => {
				expect(ctx.stdout).to.contain(
					"finding the queue [queue-dev] in [us-east-1]"
				);
				expect(ctx.stdout).to.contain(
					"polling SQS queue [https://sqs.us-east-1.amazonaws.com/12345/queue-dev]..."
				);

				expect(ctx.stdout).to.contain("message 1");
				expect(ctx.stdout).to.contain("message 2");
			});
	});

	describe("when messages are visible again after timeout", () => {
		beforeEach(() => {
			givenListQueuesReturns([
				"https://sqs.us-east-1.amazonaws.com/12345/queue-dev"
			]);

			const messages = [
				{
					MessageId: "3",
					Body: "message 3"
				},
				{
					MessageId: "4",
					Body: "message 4"
				}
			];

			givenReceiveMessageReturns(messages); // received the messages the first time
			givenReceiveMessageReturns(messages); // received them again, but they should not be shown again
			givenReceiveMessageAlwaysReturns([]);
		});

		test.stdout()
			.command(["tail-sqs", "-n", "queue-dev", "-r", "us-east-1"])
			.exit(0)
			.it("do not show them again", ctx => {
				expect(ctx.stdout).to.contain(
					"finding the queue [queue-dev] in [us-east-1]"
				);
				expect(ctx.stdout).to.contain(
					"polling SQS queue [https://sqs.us-east-1.amazonaws.com/12345/queue-dev]..."
				);

				expect(ctx.stdout).to.contain("message 3");
				expect(ctx.stdout).to.contain("message 4");
			});
	});
});

function givenListQueuesReturns(queueUrls) {
	mockListQueues.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				QueueUrls: queueUrls
			})
	});
}

function givenReceiveMessageReturns(messages) {
	mockReceiveMessage.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				Messages: messages
			})
	});
}

function givenReceiveMessageAlwaysReturns(messages) {
	mockReceiveMessage.mockReturnValue({
		promise: () =>
			Promise.resolve({
				Messages: messages
			})
	});
}
