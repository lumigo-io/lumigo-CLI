const { expect } = require("@oclif/test");
const { getAWSSDK } = require("../../src/lib/aws");
const { deleteAllRoles, deleteAllPolicies } = require("../../src/lib/iam");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors"); // Required for avoid fail on console printing
const { fail, success, getPromiseResponse } = require("../test-utils/jest-mocks");

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});

chai.use(chaiAsPromised);
describe("deleteAllRoles", () => {
	let AWS = null;
	beforeEach(() => {
		jest.resetModules();
		AWS = getAWSSDK();

		AWS.IAM.prototype.listRoles = getPromiseResponse({
			Roles: [
				{
					Path: "/aws-service-role/",
					RoleId: "1234",
					RoleName: "Private AWS"
				},
				{ Path: "/my-roles/", RoleId: "5678", RoleName: "my role" }
			]
		});

		AWS.IAM.prototype.listAttachedRolePolicies = getPromiseResponse({
			AttachedPolicies: [{ PolicyArn: "arn:iam-role" }]
		});

		AWS.IAM.prototype.listRolePolicies = getPromiseResponse({
			PolicyNames: ["my-policy"]
		});

		AWS.IAM.prototype.detachRolePolicy = success;
		AWS.IAM.prototype.deleteRolePolicy = success;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("Successful delete all iam roles except aws based ones", async function() {
		AWS.IAM.prototype.deleteRole = success;

		const result = await deleteAllRoles(AWS);

		expect(result.length).to.equal(1);
		expect(result[0].status).to.equal("success");
	});

	it("Failed deleting IAM role", async function() {
		AWS.IAM.prototype.deleteRole = fail;

		const result = await deleteAllRoles(AWS);

		expect(result.length).to.equal(1);
		expect(result[0].status).to.equal("fail");
	});

	it("Failed deleting IAM role, retry once, then fail", async function() {
		const fail = jest.fn();
		let counter = 1;
		fail.mockImplementation(() => {
			return {
				promise() {
					if (counter === 1) {
						counter++;
						return Promise.reject({ code: "Throttling" });
					} else {
						return Promise.reject(new Error());
					}
				}
			};
		});

		AWS.IAM.prototype.deleteRole = fail;

		const result = await deleteAllRoles(AWS);

		expect(result.length).to.equal(1);
		expect(result[0].status).to.equal("fail");
	});
});

describe("deleteAllPolicies", () => {
	let AWS = null;
	beforeEach(() => {
		jest.resetModules();
		AWS = getAWSSDK();

		AWS.IAM.prototype.listPolicies = getPromiseResponse({
			Policies: [
				{
					Arn: "aws:policy1",
					PolicyName: "my_policy1"
				},
				{ Arn: "aws:policy2", PolicyName: "my_policy2" }
			]
		});
		AWS.IAM.prototype.deletePolicy = success;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("Successful delete all policies", async function() {
		const result = await deleteAllPolicies(AWS);

		expect(result.length).to.equal(2);
		expect(result[0].status).to.equal("success");
	});

	it("Failed deleting policy", async function() {
		AWS.IAM.prototype.deletePolicy = fail;

		const result = await deleteAllPolicies(AWS);

		expect(result.length).to.equal(2);
		expect(result[0].status).to.equal("fail");
	});

	it("Failed deleting IAM policy, retry once, then fail", async function() {
		const fail = jest.fn();
		let counter = 1;
		fail.mockImplementation(() => {
			return {
				promise() {
					if (counter === 1) {
						counter++;
						return Promise.reject({ code: "Throttling" });
					} else {
						return Promise.reject(new Error());
					}
				}
			};
		});

		AWS.IAM.prototype.deletePolicy = fail;

		const result = await deleteAllPolicies(AWS);

		expect(result.length).to.equal(2);
		expect(result[0].status).to.equal("fail");
	});
});
