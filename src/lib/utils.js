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

	static getSkipped(name, region) {
		return new ClearResult(name, ClearResult.SKIP, region, null);
	}
}

ClearResult.SUCCESS = "success";
ClearResult.FAIL = "fail";
ClearResult.SKIP = "skip";

module.exports = {
	ClearResult
};
