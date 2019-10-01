const {expect, test} = require("@oclif/test");
const awsProfileUtils = require("aws-profile-utils");
const inquirer = require("inquirer");

const mockGetProfiles = jest.fn();
awsProfileUtils.getProfiles = mockGetProfiles;
const mockReplaceDefaultProfile = jest.fn();
awsProfileUtils.replaceDefaultProfile = mockReplaceDefaultProfile;
const mockPrompt = jest.fn();
inquirer.prompt = mockPrompt;

afterEach(() => {
	mockGetProfiles.mockReset();
	mockReplaceDefaultProfile.mockReset();
	mockPrompt.mockReset();
});

describe("switch-profile", () => {
	describe("if default profile is not set", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({});
		});
    
		test
			.stdout()
			.command(["switch-profile"])
			.exit()
			.it("exits without showing any profiles", ctx => {
				expect(ctx.stdout).to.contain("No default profile set.");
				expect(ctx.stdout).to.not.contain("You are logged in as");
			});
	});
  
	describe("if no named profiles are set", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({
				default: {
					aws_access_key_id: "xxx",
					aws_secret_access_key: "xxx"
				}
			});
		});
    
		test
			.stdout()
			.command(["switch-profile"])
			.exit()
			.it("exits without showing any profiles", ctx => {
				expect(ctx.stdout).to.contain("You don't have any named profiles set up");
				expect(ctx.stdout).to.not.contain("You are logged in as");
			});
	});
  
	describe("if user chooses the current profile", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({
				default: {
					aws_access_key_id: "xxx",
					aws_secret_access_key: "xxx"
				},
				yancui: {
					aws_access_key_id: "xxx",
					aws_secret_access_key: "xxx"
				},
				theburningmonk: {
					aws_access_key_id: "yyy",
					aws_secret_access_key: "yyy"
				}
			});
      
			mockPrompt.mockResolvedValueOnce({
				accountToSwitchTo: "yancui (current default profile)"
			});
		});
    
		test
			.stdout()
			.command(["switch-profile"])
			.it("stays logged in as current profile", ctx => {
				expect(mockReplaceDefaultProfile.mock.calls).to.have.lengthOf(0);
				expect(ctx.stdout).to.contain("stay logged in as [yancui]");
			});
	});
  
	describe("if user chooses to switch profile", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({
				default: {
					aws_access_key_id: "xxx",
					aws_secret_access_key: "xxx"
				},
				yancui: {
					aws_access_key_id: "xxx",
					aws_secret_access_key: "xxx"
				},
				theburningmonk: {
					aws_access_key_id: "yyy",
					aws_secret_access_key: "yyy"
				}
			});
      
			mockPrompt.mockResolvedValueOnce({
				accountToSwitchTo: "theburningmonk"
			});
		});
    
		test
			.stdout()
			.command(["switch-profile"])
			.it("switches to the new profile", () => {
				expect(mockReplaceDefaultProfile.mock.calls).to.have.lengthOf(1);
				const profileName = mockReplaceDefaultProfile.mock.calls[0][0];
				expect(profileName).to.equal("theburningmonk");
			});
	});
});
