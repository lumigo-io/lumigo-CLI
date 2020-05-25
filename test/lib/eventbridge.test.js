const { expect } = require("@oclif/test");
const { getAWSSDK } = require("../../src/lib/aws");
const {
	deleteAllEventBridges,
	getAllEventBridgeCount
} = require("../../src/lib/eventbridge");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors");
const { success, fail, getPromiseResponse } = require("../test-utils/jest-mocks"); // Required for avoid fail on console printing

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});
chai.use(chaiAsPromised);

describe("delete all EventBridge", () => {
	let AWS = null;

	beforeEach(() => {
		AWS = getAWSSDK();

		AWS.EventBridge.prototype.listEventBuses = getPromiseResponse({
			EventBuses: [
				{
					Name: "event1",
					Arn: "arn:eventbridge"
				}
			]
		});

		AWS.EventBridge.prototype.listRules = getPromiseResponse({
			Rules: [
				{
					Name: "rule1",
					Arn: "arn:rule1"
				}
			]
		});

		AWS.EventBridge.prototype.listTargetsByRule = getPromiseResponse({
			Targets: [
				{
					Id: "id1",
					Arn: "arn:target1"
				}
			]
		});

		AWS.EventBridge.prototype.removeTargets = success;
		AWS.EventBridge.prototype.deleteRule = success;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("Delete all EventBridge successfully", async function() {
		AWS.EventBridge.prototype.deleteEventBus = success;

		const result = await deleteAllEventBridges(AWS);

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("success");
		});
	});

	it("Fail Deleting all EventBridge", async function() {
		AWS.EventBridge.prototype.deleteEventBus = fail;

		const result = await deleteAllEventBridges(AWS, { retries: 1, minTimeout: 2 });

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("fail");
		});
	});

	it("Count number of event bridge", async function() {
		const count = await getAllEventBridgeCount(AWS);

		expect(count).to.equal(16);
	});
});
