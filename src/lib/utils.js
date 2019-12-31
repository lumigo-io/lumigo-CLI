const { getProfiles } = require("aws-profile-utils");

const areEqual = (profile, secondProfile) => {
	return (
		profile.aws_access_key_id === secondProfile.aws_access_key_id &&
		profile.aws_secret_access_key === secondProfile.aws_secret_access_key
	);
};
/**
 * @returns {string|null} Name of the profile if one is found, null otherwise
 */
const getCurrentProfile = () => {
	try {
		const profiles = getProfiles();
		const currentProfile = Object.keys(profiles)
			.filter(name => name !== "default")
			.filter(name => areEqual(profiles[name], profiles["default"]));

		return currentProfile[0];
	} catch (e) {
		return null;
	}
};

class ClearResult {
	constructor(name, status, region, reason) {
		this.name = name;
		this.status = status;
		this.region = region;
		this.reason = reason;
	}

	static getFailed(name, region, reason) {
		return new ClearResult(name, ClearResult.FAIL, region, reason);
	}

	static getSuccess(name, region) {
		return new ClearResult(name, ClearResult.SUCCESS, region, null);
	}
}

ClearResult.SUCCESS = "success";
ClearResult.FAIL = "fail";
ClearResult.SKIP = "skip";

module.exports = {
	getCurrentProfile,
	ClearResult
};
