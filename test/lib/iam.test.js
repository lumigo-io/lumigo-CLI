const { expect } = require("@oclif/test");
const { getAWSSDK } = require("../../src/lib/aws");
const { deleteAllRoles } = require("../../src/lib/iam");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors"); // Required for avoid fail on console printing

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});

const doNothing = jest.fn();
doNothing.mockImplementation(() => {
	return {
		promise() {
			return Promise.resolve({});
		}
	};
});

chai.use(chaiAsPromised);
describe("deleteAllRoles", () => {
	let AWS = null;
	beforeEach(() => {
		AWS = getAWSSDK();
		const listRoles = jest.fn();
		listRoles.mockImplementation(() => {
			return {
				promise() {
					return Promise.resolve({
						Roles: [
							{
								Path: "/aws-service-role/",
								RoleId: "1234",
								RoleName: "Private AWS"
							},
							{ Path: "/my-roles/", RoleId: "5678", RoleName: "my role" }
						]
					});
				}
			};
		});

		AWS.IAM.prototype.listRoles = listRoles;

		const listAttachedRolePolicies = jest.fn();

		listAttachedRolePolicies.mockImplementation(() => {
			return {
				promise() {
					return Promise.resolve({
						AttachedPolicies: [{ PolicyArn: "arn:iam-role" }]
					});
				}
			};
		});

		AWS.IAM.prototype.listAttachedRolePolicies = listAttachedRolePolicies;

		const listRolePolicies = jest.fn();
		listRolePolicies.mockImplementation(() => {
			return {
				promise() {
					return Promise.resolve({
						PolicyNames: ["my-policy"]
					});
				}
			};
		});

		AWS.IAM.prototype.listRolePolicies = listRolePolicies;

		AWS.IAM.prototype.detachRolePolicy = doNothing;
		AWS.IAM.prototype.deleteRolePolicy = doNothing;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("Successful delete all iam roles except aws based ones", async function() {
		AWS.IAM.prototype.deleteRole = doNothing;

		const result = await deleteAllRoles(AWS);

		expect(result.length).to.equal(1);
		expect(result[0].status).to.equal("success");
	});

	it("Failed deleting IAM role", async function() {
		const fail = jest.fn();
		fail.mockImplementation(() => {
			return {
				promise() {
					return Promise.reject(new Error());
				}
			};
		});

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
