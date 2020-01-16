const { expect } = require("@oclif/test");
const { getAWSSDK } = require("../../src/lib/aws");
const { deleteAllFunctions } = require("../../src/lib/lambda");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors");
const { success, fail } = require("../test-utils/jest-mocks"); // Required for avoid fail on console printing

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});

chai.use(chaiAsPromised);
describe("deleteAllLambdas", () => {
	let AWS = null;
	beforeEach(() => {
		AWS = getAWSSDK();
		const listFunctions = jest.fn();

		listFunctions.mockImplementation(() => {
			return {
				promise() {
					return Promise.resolve({
						Functions: [
							{
								FunctionName: "Lambda1",
								Runtime: "nodejs10.x",
								MemorySize: 1024,
								CodeSize: 34,
								LastModified: "123456",
								Timeout: 6
							}
						]
					});
				}
			};
		});

		AWS.Lambda.prototype.listFunctions = listFunctions;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("Successful lambdas successfully", async function() {
		AWS.Lambda.prototype.deleteFunction = success;

		const result = await deleteAllFunctions(AWS);

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("success");
		});
	});

	it("Failed lambdas deletion", async function() {
		AWS.Lambda.prototype.deleteFunction = fail;

		const result = await deleteAllFunctions(AWS);

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("fail");
		});
	});
});
