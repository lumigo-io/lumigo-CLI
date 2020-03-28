const { expect } = require("@oclif/test");
const { getAWSSDK } = require("../../src/lib/aws");
const { deleteAllNatGateways, getAllNatGatewaysCount } = require("../../src/lib/nat");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors");
const { success, fail, getPromiseResponse } = require("../test-utils/jest-mocks"); // Required for avoid fail on console printing

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});
chai.use(chaiAsPromised);

describe("delete all NAT Gateways", () => {
	let AWS = null;

	beforeEach(() => {
		AWS = getAWSSDK();

		AWS.EC2.prototype.describeNatGateways = getPromiseResponse({
			NatGateways: [
				{
					NatGatewayId: "natgwid",
					VpcId: "vpcid"
				}
			]
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("Delete all NAT Gateways successfully", async function() {
		AWS.EC2.prototype.deleteNatGateway = success;

		const result = await deleteAllNatGateways(AWS);

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("success");
		});
	});

	it("Fail Deleting all NAT Gateways", async function() {
		AWS.EC2.prototype.deleteNatGateway = fail;

		const result = await deleteAllNatGateways(AWS, { retries: 1, minTimeout: 2 });

		expect(result.length).to.equal(16);
		result.forEach(val => {
			expect(val.status).to.equal("fail");
		});
	});

	it("Count number of NAT Gateways", async function() {
		const count = await getAllNatGatewaysCount(AWS);

		expect(count).to.equal(16);
	});
});
