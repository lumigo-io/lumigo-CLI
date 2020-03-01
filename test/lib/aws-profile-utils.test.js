const fs = require("fs");
const profileUtils = require("../../src/lib/aws-profile-utils");

const mockReadFileSync = jest.fn();
const _readFileSync = fs.readFileSync;
const mockWriteFileSync = jest.fn();
const _writeFileSync = fs.writeFileSync;

beforeAll(() => {
	fs.readFileSync = mockReadFileSync;
	fs.writeFileSync = mockWriteFileSync;
});

beforeEach(() => {
	delete process.env.AWS_SHARED_CREDENTIALS_FILE;
	delete process.env.AWS_CONFIG_FILE;
});

afterAll(() => {
	fs.readFileSync = _readFileSync;
	fs.writeFileSync = _writeFileSync;
});

describe("aws-profile-utils", () => {
	describe("when the files are empty", () => {
		beforeEach(() => {
			mockReadFileSync.mockReturnValue("");
		});

		it("should return empty objects", () => {
			const { sharedCred, config } = profileUtils.getProfiles();
			expect(sharedCred).toEqual({});
			expect(config).toEqual({});

			expectFilePathsMatches(".aws/credential", ".aws/config");
		});
	});

	describe("when the files are populated", () => {
		beforeEach(() => {
			// shared cred config
			mockReadFileSync.mockReturnValueOnce(`[default]
role_arn = arn
source_profile = yancui

[yancui]
aws_access_key_id = key
aws_secret_access_key = key`);
			// config config
			mockReadFileSync.mockReturnValueOnce(`[profile yancui]
region = us-east-1

[profile ReadOnly]
role_arn = arn
source_profile = yancui
region = us-east-1`);
		});

		it("should return parsed objects", () => {
			const { sharedCred, config } = profileUtils.getProfiles();
			expect(sharedCred).toEqual({
				default: {
					role_arn: "arn",
					source_profile: "yancui"
				},
				yancui: {
					aws_access_key_id: "key",
					aws_secret_access_key: "key"
				}
			});
			expect(config).toEqual({
				yancui: {
					region: "us-east-1"
				},
				ReadOnly: {
					role_arn: "arn",
					source_profile: "yancui",
					region: "us-east-1"
				}
			});

			expectFilePathsMatches(".aws/credential", ".aws/config");
		});
	});
});

function expectFilePathsMatches(sharedCredFile, configFile) {
	const [path1, format1] = mockReadFileSync.mock.calls[0];
	expect(path1).toContain(sharedCredFile);
	expect(format1).toEqual("utf-8");
	const [path2, format2] = mockReadFileSync.mock.calls[1];
	expect(path2).toContain(configFile);
	expect(format2).toEqual("utf-8");
}
