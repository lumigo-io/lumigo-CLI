const { expect } = require("@oclif/test");
const { getAWSSDK } = require("../../src/lib/aws");
const { deleteAllStacks } = require("../../src/lib/cloudformation");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors");
const { success, fail } = require("../test-utils/jest-mocks"); // Required for avoid fail on console printing

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});
chai.use(chaiAsPromised);
describe("deleteAllStacks", () => {
	let AWS = null;
	beforeEach(() => {
		AWS = getAWSSDK();

		const listStacks = jest.fn();

		listStacks.mockImplementation(() => {
			return {
				promise() {
					return Promise.resolve({
						StackSummaries: [
							{
								StackId: "1234",
								StackName: "MyStack",
								StackStatus: "CREATE_COMPLETE"
							}
						]
					});
				}
			};
		});

		AWS.CloudFormation.prototype.listStacks = listStacks;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("Delete all stacks successfully", async function() {
		AWS.CloudFormation.prototype.deleteStack = success;
		AWS.CloudFormation.prototype.waitFor = success;

		const result = await deleteAllStacks(AWS);

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("success");
		});
	});

	it("Fail Deleting all stacks", async function() {
		AWS.CloudFormation.prototype.deleteStack = fail;

		const result = await deleteAllStacks(AWS, { retries: 1, minTimeout: 2 });

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("fail");
		});
	});
});
