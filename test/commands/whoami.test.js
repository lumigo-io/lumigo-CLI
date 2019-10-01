const {expect, test} = require("@oclif/test");
const awsProfileUtils = require("aws-profile-utils");

const mockGetProfiles = jest.fn();
awsProfileUtils.getProfiles = mockGetProfiles;

afterEach(() => {
	mockGetProfiles.mockReset();
});

describe("whoami", () => {
	describe("if default profile is not set", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({});
		});
    
		test
			.stdout()
			.command(["whoami"])
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
			.command(["whoami"])
			.exit()
			.it("exits without showing any profiles", ctx => {
				expect(ctx.stdout).to.contain("You don't have any named profiles set up");
				expect(ctx.stdout).to.not.contain("You are logged in as");
			});
	});
  
	describe("if no matching named profile is found", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({
				default: {
					aws_access_key_id: "xxx",
					aws_secret_access_key: "xxx"
				},
				yancui: {
					aws_access_key_id: "yyy",
					aws_secret_access_key: "yyy"
				}
			});
		});
    
		test
			.stdout()
			.command(["whoami"])
			.exit()
			.it("exits without showing any profiles", ctx => {
				expect(ctx.stdout).to.contain("It appears you are not using any of the named profiles");
				expect(ctx.stdout).to.not.contain("You are logged in as");
			});
	});
  
	describe("if a matching named profile is found", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({
				default: {
					aws_access_key_id: "xxx",
					aws_secret_access_key: "xxx"
				},
				yancui: {
					aws_access_key_id: "xxx",
					aws_secret_access_key: "xxx"
				}
			});
		});
    
		test
			.stdout()
			.command(["whoami"])
			.it("shows the matching profile", ctx => {
				expect(ctx.stdout).to.contain("You are logged in as [yancui]");
			});
	});
});
