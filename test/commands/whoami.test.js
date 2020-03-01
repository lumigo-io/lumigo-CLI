const { expect, test } = require("@oclif/test");
const profileUtils = require("../../src/lib/aws-profile-utils");

const mockGetProfiles = jest.fn();
profileUtils.getProfiles = mockGetProfiles;

beforeEach(() => {
	mockGetProfiles.mockReset();
});

describe("whoami", () => {
	describe("if default profile is not set", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({
				sharedCred: {},
				config: {}
			});
		});

		test.stdout()
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
				sharedCred: {
					default: {
						aws_access_key_id: "fake",
						aws_secret_access_key: "fake"
					}
				},
				config: {}
			});
		});

		test.stdout()
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
				sharedCred: {
					default: {
						aws_access_key_id: "fake",
						aws_secret_access_key: "fake"
					},
					yancui: {
						aws_access_key_id: "also fake",
						aws_secret_access_key: "also fake"
					}
				},
				config: {}
			});
		});

		test.stdout()
			.command(["whoami"])
			.exit()
			.it("exits without showing any profiles", ctx => {
				expect(ctx.stdout).to.contain(
					"It appears you are not using any of the named profiles"
				);
				expect(ctx.stdout).to.not.contain("You are logged in as");
			});
	});

	describe("if a matching named profile is found in shared credential file", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({
				sharedCred: {
					default: {
						aws_access_key_id: "fake",
						aws_secret_access_key: "fake"
					},
					yancui: {
						aws_access_key_id: "fake",
						aws_secret_access_key: "fake"
					}
				},
				config: {}
			});
		});

		test.stdout()
			.command(["whoami"])
			.it("shows the matching profile", ctx => {
				expect(ctx.stdout).to.contain("You are logged in as [yancui]");
			});
	});

	describe("if a matching named profile is found in config file", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({
				sharedCred: {
					default: {
						role_arn: "arn",
						source_profile: "theburningmonk"
					},
					theburningmonk: {
						aws_access_key_id: "fake",
						aws_secret_access_key: "fake"
					}
				},
				config: {
					yancui: {
						role_arn: "arn",
						source_profile: "theburningmonk"
					}
				}
			});
		});

		test.stdout()
			.command(["whoami"])
			.it("shows the matching profile", ctx => {
				expect(ctx.stdout).to.contain("You are logged in as [yancui]");
			});
	});
});
