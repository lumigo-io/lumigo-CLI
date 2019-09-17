const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");
const Promise = require("bluebird");
const ngrok = require("ngrok");
const axios = require("axios");

const mockListTopics = jest.fn();
AWS.SNS.prototype.listTopics = mockListTopics;
const mockSubscribe = jest.fn();
AWS.SNS.prototype.subscribe = mockSubscribe;
const mockUnsubscribe = jest.fn();
AWS.SNS.prototype.unsubscribe = mockUnsubscribe;
const mockConnect = jest.fn();
ngrok.connect = mockConnect;
const mockKill = jest.fn();
ngrok.kill = mockKill;
const mockGet = jest.fn();
axios.get = mockGet;
const mockOpenStdin = jest.fn();
process.openStdin = mockOpenStdin;
process.stdin.setRawMode = jest.fn();
process.exit = jest.fn();

const consoleLog = jest.fn();
console.log = consoleLog;

beforeEach(() => {
	mockListTopics.mockReset();
	mockSubscribe.mockReset();
	mockUnsubscribe.mockReset();
	consoleLog.mockReset();
	mockConnect.mockReset();
	mockGet.mockReset();
	mockKill.mockReset();
	mockOpenStdin.mockReset();
  
	mockConnect.mockResolvedValue("https://lumigo.io");
	mockGet.mockResolvedValue({});
  
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
		});
    
		test
			.stdout()
			.command(["tail-sns", "-n", "my-topic-dev", "-r", "us-east-1"])
			.it("creates a new webserver and connects to ngrok", ctx => {
				expect(ctx.stdout).to.contain("finding the topic [my-topic-dev] in [us-east-1]");
				const logMessages = consoleLog.mock.calls.map(x => x[0]).join("\n");
				expect(logMessages).to.contain("listening at https://lumigo.io");
				expect(mockConnect.mock.calls).to.have.length(1);
			});
    
		test
			.stdout()
			.command(["tail-sns", "-n", "my-topic-dev", "-r", "us-east-1"])
			.it("stops the webserver when disconnected", async () => {
				await Promise.delay(1000); // wait for mockOpenStdin to trigger callback

				const logMessages = consoleLog.mock.calls.map(x => x[0]).join("\n");
				expect(logMessages).to.contain("stopping webserver...");
				expect(logMessages).to.contain("terminating ngrok process...");        
			});
    
		test
			.stdout()
			.command(["tail-sns", "-n", "my-topic-dev", "-r", "us-east-1"])
			.do(async () => {
				await givenSnsSends(JSON.stringify({
					Type: "SubscriptionConfirmation",
					SubscribeURL: "https://lumigo.io"
				}));
        
				await givenSnsSends(JSON.stringify({
					Type: "Notification",
					Message: "serverless FTW"
				}));
			})
			.it("handles SNS subscription flow", async () => {
				const logMessages = consoleLog.mock.calls.map(x => x[0]).join("\n");
				expect(logMessages).to.contain("listening at https://lumigo.io");
				expect(logMessages).to.contain("confirmed SNS subscription");
				expect(logMessages).to.contain("polling SNS topic [arn:aws:sns:us-east-1:12345:my-topic-dev]...");
				expect(logMessages).to.contain("press <any key> to stop");
				expect(logMessages).to.contain("serverless FTW");
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

async function givenSnsSends(data) {
	const [[port]] = mockConnect.mock.calls;
	await axios({
		method: "post",
		url: `http://localhost:${port}`,
		data,
		headers: { "Content-Type": "text/plain" }
	});
}
