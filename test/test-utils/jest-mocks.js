const success = jest.fn();
success.mockImplementation(() => {
	return {
		promise() {
			return Promise.resolve({});
		}
	};
});

const fail = jest.fn();
fail.mockImplementation(() => {
	return {
		promise() {
			return Promise.reject(new Error());
		}
	};
});

module.exports = {
	fail,
	success
};
