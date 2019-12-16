const _ = require("lodash");
const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");

const mockListTopics = jest.fn();
AWS.SNS.prototype.listTopics = mockListTopics;
const mockPublish = jest.fn();
AWS.SNS.prototype.publish = mockPublish;

const consoleLog = jest.fn();
console.log = consoleLog;
console.time = consoleLog;
console.timeEnd = consoleLog;
process.stdout.clearLine = jest.fn();
process.stdout.cursorTo = jest.fn();

beforeEach(() => {
	mockListTopics.mockReset();
	mockPublish.mockReset();
	consoleLog.mockReset();
  
	mockListTopics.mockReturnValue({
		promise: () => Promise.resolve({
			Topics: [{ TopicArn: "arn:aws:sns:us-east-1:12345:my-topic" }]
		})
	});  
});

describe("send-to-sns", () => {
	describe("when there are no failures", () => {
		beforeEach(() => {
			givenPublishAlwaysReturns();
		});
    
		test
			.stdout()
			.command(["send-to-sns", "-n", "my-topic", "-r", "us-east-1", "-f", "test/test_sns_input.txt"])
			.it("sends all the file's content to sns", ctx => {
				expect(ctx.stdout).to.contain("all done!");

				// there's a total of 5 messages
				expect(mockPublish.mock.calls).to.have.lengthOf(5);
				const messages = _
					.flatMap(mockPublish.mock.calls, calls => calls)
					.map(x => x.Message);
				expect(messages).to.have.lengthOf(5);
				_.range(1, 6).forEach(n => {
					expect(messages).to.contain(`message ${n}`);
				});				
			});
	});
  
	describe("when there are failures", () => {
		beforeEach(() => {
			givenPublishFails(new Error("boom!"));
			givenPublishAlwaysReturns();
		});
    
		test
			.stdout()
			.command(["send-to-sns", "-n", "my-topic", "-r", "us-east-1", "-f", "test/test_sns_input.txt"])
			.it("reports the failed messages", ctx => {
				expect(ctx.stdout).to.contain("all done!");

				// there's a total of 5 messages
				expect(mockPublish.mock.calls).to.have.lengthOf(5);
				const messages = _
					.flatMap(mockPublish.mock.calls, calls => calls)
					.map(x => x.Message);
				expect(messages).to.have.lengthOf(5);
        
				const logMessages = _.flatMap(consoleLog.mock.calls, call => call).join("\n");
				expect(logMessages).to.contain("boom!");
			});
	});
});

function givenPublishAlwaysReturns() {
	mockPublish.mockReturnValue({
		promise: () => Promise.resolve({})
	});
};

function givenPublishFails(error) {
	mockPublish.mockReturnValueOnce({
		promise: () => Promise.reject(error)
	});
};
