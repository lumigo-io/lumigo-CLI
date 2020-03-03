const { expect, test } = require("@oclif/test");
const inquirer = require("inquirer");
const profileUtils = require("../../src/lib/aws-profile-utils");

const mockGetProfiles = jest.fn();
profileUtils.getProfiles = mockGetProfiles;
const mockReplaceProfiles = jest.fn();
profileUtils.replaceProfiles = mockReplaceProfiles;
const mockPrompt = jest.fn();
inquirer.prompt = mockPrompt;

beforeEach(() => {
	mockGetProfiles.mockReset();
	mockReplaceProfiles.mockReset();
	mockPrompt.mockReset();

	mockReplaceProfiles.mockReturnValue();
});

describe("switch-profile", () => {
	describe("if default profile is not set", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({
				sharedCred: {
					yancui: {
						aws_access_key_id: "fake",
						aws_secret_access_key: "fake"
					}
				},
				config: {}
			});

			mockPrompt.mockResolvedValueOnce({
				accountToSwitchTo: "yancui"
			});
		});

		test.stdout()
			.command(["switch-profile"])
			.it(
				"options are presented without the suffix (current default profile)",
				ctx => {
					expect(ctx.stdout).to.contain("You are now logged in as [yancui]");
					expect(mockPrompt.mock.calls).to.have.length(1);
					expectMockIsCalledWith(mockPrompt, ([{ choices }]) => {
						expect(choices).to.deep.eq(["yancui"]);
					});
					expect(mockReplaceProfiles.mock.calls).to.have.length(1);
					expectMockIsCalledWith(mockReplaceProfiles, actual => {
						expect(actual).to.deep.eq({
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
				}
			);
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
			.command(["switch-profile"])
			.exit()
			.it("exits without showing any profiles", ctx => {
				expect(ctx.stdout).to.contain("You don't have any named profiles set up");
				expect(ctx.stdout).to.not.contain("You are now logged in as");
				expect(mockReplaceProfiles.mock.calls).to.be.empty;
			});
	});

	describe("if user chooses the current profile", () => {
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

			mockPrompt.mockResolvedValueOnce({
				accountToSwitchTo: "yancui (current default profile)"
			});
		});

		test.stdout()
			.command(["switch-profile"])
			.it("stays logged in as current profile", ctx => {
				expect(ctx.stdout).to.contain("Stay logged in as [yancui]");
				expect(mockReplaceProfiles.mock.calls).to.be.empty;
			});
	});

	describe("if user chooses to switch to a shared credential profile", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({
				sharedCred: {
					default: {
						aws_access_key_id: "fake",
						aws_secret_access_key: "fake"
					},
					yancui: {
						aws_access_key_id: "key",
						aws_secret_access_key: "key"
					}
				},
				config: {}
			});

			mockPrompt.mockResolvedValueOnce({
				accountToSwitchTo: "yancui"
			});
		});

		test.stdout()
			.command(["switch-profile"])
			.it("switches to the new profile", ctx => {
				expect(ctx.stdout).to.contain("You are now logged in as [yancui]");
				expect(mockReplaceProfiles.mock.calls).to.have.length(1);
				expectMockIsCalledWith(mockReplaceProfiles, actual => {
					expect(actual).to.deep.eq({
						sharedCred: {
							default: {
								aws_access_key_id: "key",
								aws_secret_access_key: "key"
							},
							yancui: {
								aws_access_key_id: "key",
								aws_secret_access_key: "key"
							}
						},
						config: {}
					});
				});
			});
	});

	describe("if user chooses to switch to a config profile", () => {
		beforeEach(() => {
			mockGetProfiles.mockReturnValueOnce({
				sharedCred: {
					default: {
						aws_access_key_id: "fake",
						aws_secret_access_key: "fake"
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

			mockPrompt.mockResolvedValueOnce({
				accountToSwitchTo: "yancui"
			});
		});

		test.stdout()
			.command(["switch-profile"])
			.it("switches to the new profile", ctx => {
				expect(ctx.stdout).to.contain("You are now logged in as [yancui]");
				expect(mockReplaceProfiles.mock.calls).to.have.length(1);
				expectMockIsCalledWith(mockReplaceProfiles, actual => {
					expect(actual).to.deep.eq({
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
			});
	});
});

function expectMockIsCalledWith(mockF, f) {
	const [actual] = mockF.mock.calls[0];
	f(actual);
}
