const { expect } = require("@oclif/test");
const AWSMock = require("aws-sdk-mock");
const { getAWSSDK } = require("../../src/lib/aws");
const { deleteAllFunctions } = require("../../src/lib/lambda");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors"); // Required for avoid fail on console printing

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});

chai.use(chaiAsPromised);
describe("deleteAllLambdas", () => {
	let AWS = null;
	beforeEach(() => {
		AWS = getAWSSDK();
		AWSMock.setSDKInstance(AWS);

		AWSMock.mock("Lambda", "listFunctions", function(params, callback) {
			callback(null, {
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
		});
	});

	afterEach(() => {
		AWSMock.restore();
	});

	it("Successful lambdas successfully", async function() {
		AWSMock.mock("Lambda", "deleteFunction", function(params, callback) {
			callback(null, {});
		});

		const result = await deleteAllFunctions(AWS);

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("success");
		});
	});

	it("Failed lambdas deletion", async function() {
		AWSMock.mock("Lambda", "deleteFunction", function(params, callback) {
			callback(new Error("Boom!"));
		});

		const result = await deleteAllFunctions(AWS);

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("fail");
		});
	});
});
