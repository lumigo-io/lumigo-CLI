const { expect } = require("@oclif/test");
const { getAWSSDK } = require("../../src/lib/aws");
const {
	deleteAllLogGroups,
	getAllLogGroupsCount
} = require("../../src/lib/cloudwatch-logs");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors");
const { success, fail, getPromiseResponse } = require("../test-utils/jest-mocks"); // Required for avoid fail on console printing

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});
chai.use(chaiAsPromised);

describe("test interface", () => {
	let AWS = null;

	beforeEach(() => {
		AWS = getAWSSDK();

		AWS.CloudWatchLogs.prototype.describeLogGroups = getPromiseResponse({
			logGroups: [
				{
					logGroupName: "1234",
					arn: "arn:loggroup",
					storedBytes: 1024
				}
			]
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("Delete all logs successfully", async function() {
		AWS.CloudWatchLogs.prototype.deleteLogGroup = success;

		const result = await deleteAllLogGroups(AWS);

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("success");
		});
	});

	it("Fail Deleting all logs", async function() {
		AWS.CloudWatchLogs.prototype.deleteLogGroup = fail;

		const result = await deleteAllLogGroups(AWS, { retries: 1, minTimeout: 2 });

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("fail");
		});
	});

	it("Count number of log groups", async function() {
		const count = await getAllLogGroupsCount(AWS);

		expect(count).to.equal(16);
	});
});
