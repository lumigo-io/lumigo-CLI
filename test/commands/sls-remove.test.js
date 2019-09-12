const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");

const mockDescribeStacks = jest.fn();
AWS.CloudFormation.prototype.describeStacks = mockDescribeStacks;
const mockDeleteStack = jest.fn();
AWS.CloudFormation.prototype.deleteStack = mockDeleteStack;
const mockWaitFor = jest.fn();
AWS.CloudFormation.prototype.waitFor = mockWaitFor;
const mockListObjectsV2 = jest.fn();
AWS.S3.prototype.listObjectsV2 = mockListObjectsV2;
const mockDeleteObjects = jest.fn();
AWS.S3.prototype.deleteObjects = mockDeleteObjects;

const bucketName = "my-deployment-bucket-dev-ERWRFSDF";

beforeEach(() => {
	mockDescribeStacks.mockReturnValue({
		promise: () => Promise.resolve({
			Stacks: [{
				Outputs: [{
					OutputKey: "ServerlessDeploymentBucketName",
					OutputValue: bucketName
				}]
			}]
		})
	});
  
	mockDeleteStack.mockReturnValue({
		promise: () => Promise.resolve()
	});
  
	mockWaitFor.mockReturnValue({
		promise: () => Promise.resolve()
	});
  
	mockListObjectsV2.mockReturnValue({
		promise: () => Promise.resolve({
			Contents: [{
				Key: "my-key"
			}]
		})
	});
  
	mockDeleteObjects.mockReturnValue({
		promise: () => Promise.resolve()
	});
});

describe("sls-remove", () => {
	test
		.stdout()
		.command(["sls-remove", "hello-world-dev", "us-east-1"])
		.it("sls-remove hello-world-dev us-east-1", ctx => {
			expect(ctx.stdout).to.contain("getting the deployment bucket name for [hello-world-dev] in [us-east-1]");
			expect(ctx.stdout).to.contain(`emptying deployment bucket [${bucketName}]...`);
			expect(ctx.stdout).to.contain("removing the stack [hello-world-dev] in [us-east-1]...");
			expect(ctx.stdout).to.contain("stack has been deleted!");
		});
    
	describe("when stack is not created by SLS", () => {
		beforeEach(() => {
			mockDeleteStack.mockReset();
			mockDescribeStacks.mockReturnValue({
				promise: () => Promise.resolve({
					Stacks: [{
						Outputs: []
					}]
				})
			});
		});
    
		const errorMessage = 'Stack [hello-world-dev] in [us-east-1] does not have a "ServerlessDeploymentBucketName", are you sure it was deployed with Serverless framework?';
		test
			.stdout()
			.command(["sls-remove", "hello-world-dev", "us-east-1"])
			.catch(err => expect(err.message).to.equal(errorMessage))
			.it("throws when the CloudFormation stack was not created by SLS");
	});
});
