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

const getPromiseResponse = response => {
	const mockFunction = jest.fn();
	mockFunction.mockImplementation(() => {
		return {
			promise() {
				return Promise.resolve(response);
			}
		};
	});

	return mockFunction;
};

module.exports = {
	fail,
	success,
	getPromiseResponse
};
