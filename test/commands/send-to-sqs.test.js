const _ = require("lodash");
const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");
const uuid = require("uuid/v4");

const mockListQueues = jest.fn();
AWS.SQS.prototype.listQueues = mockListQueues;
const mockSendMessageBatch = jest.fn();
AWS.SQS.prototype.sendMessageBatch = mockSendMessageBatch;

const consoleLog = jest.fn();
console.log = consoleLog;
console.time = consoleLog;
console.timeEnd = consoleLog;
process.stdout.clearLine = jest.fn();
process.stdout.cursorTo = jest.fn();
jest.mock("uuid/v4");

const queueUrl = "https://sqs.us-east-1.amazonaws.com/12345/queue-dev";

beforeEach(() => {
	mockListQueues.mockReset();
	mockSendMessageBatch.mockReset();
	consoleLog.mockReset();
  
	uuid.mockImplementation(() => "testid");
  
	mockListQueues.mockReturnValue({
		promise: () => Promise.resolve({
			QueueUrls: [queueUrl]
		})
	});  
});

describe("send-to-sqs", () => {
	describe("when there are no failures", () => {
		beforeEach(() => {
			givenSendMessageBatchReturns();
			givenSendMessageBatchReturns();
		});
    
		test
			.stdout()
			.command(["send-to-sqs", "-n", "queue-dev", "-r", "us-east-1", "-f", "test/test_sqs_input.txt"])
			.it("sends all the file's content to sqs", ctx => {
				expect(ctx.stdout).to.contain("all done!");

				// there's a total of 15 messages, so should be two batches
				expect(mockSendMessageBatch.mock.calls).to.have.lengthOf(2);
				const messages = _
					.flatMap(mockSendMessageBatch.mock.calls, calls => calls[0].Entries)
					.map(x => x.MessageBody);
				expect(messages).to.have.lengthOf(15);
				_.range(1, 16).forEach(n => {
					expect(messages).to.contain(`message ${n}`);
				});				
			});
	});

	describe("when there are partial failures", () => {
		beforeEach(() => {
			givenSendMessageBatchReturns([{
				Id: "testid",
				Message: "boom!"
			}]);
			givenSendMessageBatchReturns();
		});
    
		test
			.stdout()
			.command(["send-to-sqs", "-n", "queue-dev", "-r", "us-east-1", "-f", "test/test_sqs_input.txt"])
			.it("reports the failed messages", ctx => {
				expect(ctx.stdout).to.contain("all done!");

				// there's a total of 15 messages, so should be two batches
				expect(mockSendMessageBatch.mock.calls).to.have.lengthOf(2);
				const messages = _
					.flatMap(mockSendMessageBatch.mock.calls, calls => calls[0].Entries)
					.map(x => x.MessageBody);
				expect(messages).to.have.lengthOf(15);
        
				const logMessages = _.flatMap(consoleLog.mock.calls, call => call).join("\n");
				expect(logMessages).to.contain("boom!");
			});
	});

	describe("when an entire requets fails", () => {
		beforeEach(() => {
			givenSendMessageBatchReturns();
			givenSendMessageBatchFails(new Error("boom!"));
		});
    
		test
			.stdout()
			.command(["send-to-sqs", "-n", "queue-dev", "-r", "us-east-1", "-f", "test/test_sqs_input.txt"])
			.it("reports the failed messages", ctx => {
				expect(ctx.stdout).to.contain("all done!");

				// there's a total of 15 messages, so should be two batches
				expect(mockSendMessageBatch.mock.calls).to.have.lengthOf(2);
				const messages = _
					.flatMap(mockSendMessageBatch.mock.calls, calls => calls[0].Entries)
					.map(x => x.MessageBody);
				expect(messages).to.have.lengthOf(15);
        
				const logMessages = _.flatMap(consoleLog.mock.calls, call => call).join("\n");
				expect(logMessages).to.contain("boom!");
			});
	});
});

function givenSendMessageBatchReturns(failed) {
	mockSendMessageBatch.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Failed: failed
		})
	});
};

function givenSendMessageBatchFails(error) {
	mockSendMessageBatch.mockReturnValueOnce({
		promise: () => Promise.reject(error)
	});
};
