const { expect, test } = require("@oclif/test");
const AWS = require("aws-sdk");
const Promise = require("bluebird");

const mockDescribeRule = jest.fn();
AWS.EventBridge.prototype.describeRule = mockDescribeRule;
const mockPutTargets = jest.fn();
AWS.EventBridge.prototype.putTargets = mockPutTargets;
const mockRemoveTargets = jest.fn();
AWS.EventBridge.prototype.removeTargets = mockRemoveTargets;
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

const ruleName = "my-rule";
const command = ["tail-eventbridge-rule", "-n", ruleName, "-r", "us-east-1"];
const proxyCommand = ["tail-cloudwatch-events-rule", "-n", ruleName, "-r", "us-east-1"];

beforeEach(() => {
	mockDescribeRule.mockReset();
	mockPutTargets.mockReset();
	mockRemoveTargets.mockReset();
	mockOpenStdin.mockReset();
	mockCreateQueue.mockReset();
	mockDeleteQueue.mockReset();
	mockDeleteMessageBatch.mockReset();

	mockCreateQueue.mockReturnValue({
		promise: () =>
			Promise.resolve({
				QueueUrl: "https://sqs.us-east-1.amazonaws.com/12345/test"
			})
	});

	mockDeleteQueue.mockReturnValue({
		promise: () => Promise.resolve()
	});

	mockDeleteMessageBatch.mockReturnValue({
		promise: () => Promise.resolve()
	});

	mockPutTargets.mockReturnValue({
		promise: () => Promise.resolve()
	});

	mockRemoveTargets.mockReturnValue({
		promise: () => Promise.resolve()
	});

	mockOpenStdin.mockReturnValue({
		once: (_event, cb) => Promise.delay(1000).then(cb)
	});
});

describe("tail-eventbridge-rule", () => {
	describe("when the EventBridge rule doesn't exist", () => {
		beforeEach(() => {
			givenRuleIsNotFound();
		});

		test.stdout()
			.command(command)
			.catch(err => {
				expect(err.message.startsWith("ResourceNotFoundException")).to.be.true;
			})
			.it("should error", ctx => {
				expect(ctx.stdout).to.contain(
					"finding the rule [my-rule] (bus [default]) in [us-east-1]"
				);
			});

		test.stdout()
			.command(proxyCommand)
			.catch(err => {
				expect(err.message.startsWith("ResourceNotFoundException")).to.be.true;
			})
			.it("should error (tail-cloudwatch-events-rule)", ctx => {
				expect(ctx.stdout).to.contain(
					"finding the rule [my-rule] (bus [default]) in [us-east-1]"
				);
			});
	});

	describe("when the EventBridge rule exists", () => {
		beforeEach(() => {
			givenDescribeRuleReturns();
			givenReceiveMessageReturns([
				{
					MessageId: "1",
					ReceiptHandle: "1",
					Body: JSON.stringify({
						region: "us-east-1",
						source: "my-source",
						time: new Date().toJSON(),
						resources: [],
						["detail-type"]: "order_placed",
						detail: JSON.stringify({
							orderId: "orderId"
						})
					})
				}
			]);
			givenReceiveMessageAlwaysReturns([]);
		});

		test.stdout()
			.command(command)
			.exit(0)
			.it("fetches and prints the events", ctx => {
				expect(ctx.stdout).to.contain(
					JSON.stringify(
						{
							Region: "us-east-1",
							Source: "my-source",
							Resources: [],
							"Detail-Type": "order_placed",
							Detail: JSON.stringify({
								orderId: "orderId"
							})
						},
						undefined,
						2
					)
				);
			});

		test.stdout()
			.command(proxyCommand)
			.exit(0)
			.it("fetches and prints the events (tail-cloudwatch-events-rule)", ctx => {
				expect(ctx.stdout).to.contain(
					JSON.stringify(
						{
							Region: "us-east-1",
							Source: "my-source",
							Resources: [],
							"Detail-Type": "order_placed",
							Detail: JSON.stringify({
								orderId: "orderId"
							})
						},
						undefined,
						2
					)
				);
			});
	});

	describe("when the EventBridge rule is disabled", () => {
		beforeEach(() => {
			givenDescribeRuleReturns("DISABLED");
			givenReceiveMessageAlwaysReturns([]);
		});

		test.stdout()
			.command(command)
			.exit(0)
			.it("prints a warning messasge", ctx => {
				expect(ctx.stdout).to.contain("WARNING!");
				expect(ctx.stdout).to.contain(
					"You won't see events until you enable it."
				);
			});

		test.stdout()
			.command(proxyCommand)
			.exit(0)
			.it("prints a warning messasge (tail-cloudwatch-events-rule)", ctx => {
				expect(ctx.stdout).to.contain("WARNING!");
				expect(ctx.stdout).to.contain(
					"You won't see events until you enable it."
				);
			});
	});
});

function givenRuleIsNotFound() {
	mockDescribeRule.mockReturnValueOnce({
		promise: () =>
			Promise.reject(
				new Error(
					`ResourceNotFoundException: Rule ${ruleName} does not exist on EventBus default`
				)
			)
	});
}

function givenDescribeRuleReturns(state = "ENABLED") {
	mockDescribeRule.mockReturnValueOnce({
		promise: () =>
			Promise.resolve({
				Arn: "arn",
				State: state
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
