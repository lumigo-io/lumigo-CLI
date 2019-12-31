const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");
const Promise = require("bluebird");
const TailEventbridgeRuleCommand = require("../../src/commands/tail-eventbridge-rule");

const mockPutRule = jest.fn();
AWS.EventBridge.prototype.putRule = mockPutRule;
const mockDeleteRule = jest.fn();
AWS.EventBridge.prototype.deleteRule = mockDeleteRule;
const mockRun = jest.fn();
TailEventbridgeRuleCommand.prototype.run = mockRun;

const busName = "my-bus";
const command = ["tail-eventbridge-bus", "-n", busName, "-r", "us-east-1"];
const proxyCommand = ["tail-cloudwatch-events-bus", "-n", busName, "-r", "us-east-1"];

beforeEach(() => {
	mockPutRule.mockReset();
	mockDeleteRule.mockReset();
	mockRun.mockReset();
  
	mockPutRule.mockReturnValue({
		promise: () => Promise.resolve()
	});
  
	mockDeleteRule.mockReturnValue({
		promise: () => Promise.resolve()
	});
});

describe("tail-eventbridge-bus", () => {
	describe("when the TailEventbridgeRuleCommand succeeds", () => {
		beforeEach(() => {
			givenTailEventbridgeRuleSucceeds();
		});
    
		test
			.stdout()
			.command(command)
			.exit(0)
			.it("deletes the temporary rule", () => {
				expect(mockPutRule.mock.calls).to.have.length(1);
				expect(mockDeleteRule.mock.calls).to.have.length(1);
			});
    
		test
			.stdout()
			.command(proxyCommand)
			.exit(0)
			.it("deletes the temporary rule", () => {
				expect(mockPutRule.mock.calls).to.have.length(1);
				expect(mockDeleteRule.mock.calls).to.have.length(1);
			});
	});
  
	describe("when the TailEventbridgeRuleCommand fails", () => {
		beforeEach(() => {
			givenTailEventbridgeRuleFails();
		});
    
		test
			.stdout()
			.command(command)
			.catch("boom!")
			.it("deletes the temporary rule", () => {
				expect(mockPutRule.mock.calls).to.have.length(1);
				expect(mockDeleteRule.mock.calls).to.have.length(1);
			});
    
		test
			.stdout()
			.command(proxyCommand)
			.catch("boom!")
			.it("deletes the temporary rule", () => {
				expect(mockPutRule.mock.calls).to.have.length(1);
				expect(mockDeleteRule.mock.calls).to.have.length(1);
			});
	});
  
	describe("when the optional profile flag is set", () => {
		beforeEach(() => {
			givenTailEventbridgeRuleSucceeds();
		});
    
		test
			.stdout()
			.command([...command, "-p", "my-profile"])
			.exit(0)
			.it("deletes the temporary rule", () => {
				expect(mockPutRule.mock.calls).to.have.length(1);
				expect(mockDeleteRule.mock.calls).to.have.length(1);
			});
    
		test
			.stdout()
			.command([...proxyCommand, "-p", "my-profile"])
			.exit(0)
			.it("deletes the temporary rule", () => {
				expect(mockPutRule.mock.calls).to.have.length(1);
				expect(mockDeleteRule.mock.calls).to.have.length(1);
			});
	});
});

function givenTailEventbridgeRuleSucceeds() {
	mockRun.mockResolvedValueOnce();
};

function givenTailEventbridgeRuleFails() {
	mockRun.mockRejectedValueOnce(new Error("boom!"));
};
