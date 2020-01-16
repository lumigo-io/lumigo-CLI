const { expect } = require("@oclif/test");
const { getAWSSDK } = require("../../src/lib/aws");
const { deleteAllBuckets } = require("../../src/lib/s3");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors");
const { success, fail } = require("../test-utils/jest-mocks"); // Required for avoid fail on console printing

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});

chai.use(chaiAsPromised);
describe("deleteAllBuckets", () => {
	let AWS = null;
	beforeAll(() => {
		AWS = getAWSSDK();
	});

	beforeEach(() => {
		AWS = getAWSSDK();
		const listBuckets = jest.fn();

		listBuckets.mockImplementation(() => {
			return {
				promise() {
					return Promise.resolve({
						Buckets: [{ Name: "MyBucket" }]
					});
				}
			};
		});

		AWS.S3.prototype.listBuckets = listBuckets;

		const listObjectsV2 = jest.fn();

		listObjectsV2.mockImplementation(() => {
			return {
				promise() {
					return Promise.resolve({
						Contents: [{ Key: "MyItem.txt" }]
					});
				}
			};
		});

		AWS.S3.prototype.listObjectsV2 = listObjectsV2;
		AWS.S3.prototype.deleteObjects = success;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("Successful delete of a single bucket", async function() {
		AWS.S3.prototype.deleteBucket = success;

		const result = await deleteAllBuckets(AWS);

		expect(result.length).to.equal(1);
		expect(result[0].name).to.equal("MyBucket");
		expect(result[0].status).to.equal("success");
	});

	it("Failed delete of a single bucket", async function() {
		AWS.S3.prototype.deleteBucket = fail;

		const result = await deleteAllBuckets(AWS);

		expect(result.length).to.equal(1);
		expect(result[0].name).to.equal("MyBucket");
		expect(result[0].reason.message).to.equal("");
		expect(result[0].status).to.equal("fail");
	});
});
