const { expect } = require("@oclif/test");
const AWSMock = require("aws-sdk-mock");
const { getAWSSDK } = require("../../src/lib/aws");
const { deleteAllBuckets } = require("../../src/lib/s3");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors"); // Required for avoid fail on console printing

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});

chai.use(chaiAsPromised);
describe("deleteAllBuckets", () => {
	let AWS = null;
	beforeAll(() => {
		AWS = getAWSSDK();
		AWSMock.setSDKInstance(AWS);
	});

	afterEach(() => {
		AWSMock.restore();
	});

	it("Successful delete of a single bucket", async function() {
		AWSMock.mock("S3", "listBuckets", function(callback) {
			callback(null, {
				Buckets: [{ Name: "MyBucket" }]
			});
		});

		AWSMock.mock("S3", "listObjectsV2", function(params, callback) {
			callback(null, {
				Contents: [{ Key: "MyItem.txt" }]
			});
		});

		AWSMock.mock("S3", "deleteObjects", function(params, callback) {
			callback(null, {});
		});

		AWSMock.mock("S3", "deleteBucket", function(params, callback) {
			callback(null, {});
		});

		const result = await deleteAllBuckets(AWS);

		expect(result.length).to.equal(1);
		expect(result[0].name).to.equal("MyBucket");
		expect(result[0].status).to.equal("success");
	});

	it("Failed delete of a single bucket", async function() {
		AWSMock.mock("S3", "listBuckets", function(callback) {
			callback(null, {
				Buckets: [{ Name: "MyBucket" }]
			});
		});

		AWSMock.mock("S3", "listObjectsV2", function(params, callback) {
			callback(null, {
				Contents: [{ Key: "MyItem.txt" }]
			});
		});

		AWSMock.mock("S3", "deleteObjects", function(params, callback) {
			callback(null, {});
		});

		AWSMock.mock("S3", "deleteBucket", function(params, callback) {
			callback(new Error("Boom!"));
		});

		const result = await deleteAllBuckets(AWS);

		expect(result.length).to.equal(1);
		expect(result[0].name).to.equal("MyBucket");
		expect(result[0].reason.message).to.equal("Boom!");
		expect(result[0].status).to.equal("fail");
	});
});
