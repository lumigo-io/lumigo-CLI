const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");

const mockDescribeStacks = jest.fn();
AWS.CloudFormation.prototype.describeStacks = mockDescribeStacks;
const mockDescribeResources = jest.fn();
AWS.CloudFormation.prototype.describeStackResources = mockDescribeResources;
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

afterEach(() => {
	mockDescribeStacks.mockReset();
	mockDeleteStack.mockReset();
	mockDescribeResources.mockReset();
	mockWaitFor.mockReset();
	mockListObjectsV2.mockReset();
	mockDeleteObjects.mockReset();
});

describe("sls-remove", () => {
	test
		.stdout()
		.command(["sls-remove", "-n", "hello-world-dev", "-r", "us-east-1"])
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
			.command(["sls-remove", "-n", "hello-world-dev", "-r", "us-east-1"])
			.catch(err => expect(err.message).to.equal(errorMessage))
			.it("throws when the CloudFormation stack was not created by SLS");
	});
  
	describe("when emptyS3Buckets is enabled", () => {
		describe("when there are no other buckets", () => {
			beforeEach(() => {
				mockDescribeResources.mockReturnValueOnce({
					promise: () => Promise.resolve({
						StackResources: [{
							StackName: "hello-world-dev",
							ResourceType: "AWS::S3::Bucket",
							LogicalResourceId: "ServerlessDeploymentBucket",
							PhysicalResourceId: bucketName
						}]
					})
				});
			});

			test
				.stdout()
				.command(["sls-remove", "-n", "hello-world-dev", "-r", "us-east-1", "-e"])
				.it("does nothing", ctx => {
					expect(ctx.stdout).to.contain("no other S3 buckets are found besides the deployment bucket");
				});
		});
    
		describe("when there are other buckets", () => {
			beforeEach(() => {
				mockDescribeResources.mockReturnValueOnce({
					promise: () => Promise.resolve({
						StackResources: [{
							StackName: "hello-world-dev",
							ResourceType: "AWS::S3::Bucket",
							LogicalResourceId: "ServerlessDeploymentBucket",
							PhysicalResourceId: bucketName
						}, {
							StackName: "hello-world-dev",
							ResourceType: "AWS::S3::Bucket",
							LogicalResourceId: "MyBucket",
							PhysicalResourceId: "my-bucket"
						}, {
							StackName: "hello-world-dev",
							ResourceType: "AWS::S3::Bucket",
							LogicalResourceId: "YourBucket",
							PhysicalResourceId: "your-bucket"
						}]
					})
				});
			});

			test
				.stdout()
				.command(["sls-remove", "-n", "hello-world-dev", "-r", "us-east-1", "-e"])
				.it("empties the other buckets", ctx => {
					expect(ctx.stdout).to.contain("found 2 buckets (excluding the deployment bucket)");
					expect(ctx.stdout).to.contain("emptying bucket [my-bucket]...");
					expect(ctx.stdout).to.contain("emptying bucket [your-bucket]...");
          
					expect(mockListObjectsV2.mock.calls).to.have.lengthOf(3);
					const buckets = mockListObjectsV2.mock.calls.map(([{ Bucket }]) => Bucket);
					expect(buckets).to.deep.equal([bucketName, "my-bucket", "your-bucket"]);
					expect(mockDeleteObjects.mock.calls).to.have.lengthOf(3);
				});
		});
	});
});
