const { ClearResult } = require("./utils");

const emptyBucket = async (bucketName, AWS) => {
	const S3 = new AWS.S3();
	let response = {};
	do {
		const params = response.ContinuationToken
			? { Bucket: bucketName, ContinuationToken: response.ContinuationToken }
			: { Bucket: bucketName };
		response = await S3.listObjectsV2(params).promise();

		const keys = response.Contents.map(x => ({ Key: x.Key }));
		if (keys.length > 0) {
			await S3.deleteObjects({
				Bucket: bucketName,
				Delete: {
					Objects: keys
				}
			}).promise();
		}
	} while (response.ContinuationToken);
};

/**
 * Delete all buckets in an account
 * @param AWS SDK AWS object.
 * @returns {Promise<*>} A list of objects with
 * {
 *   status: success | fail
 *   bucketName: bucket name
 *   reason: The exception object | null
 * }
 */
const deleteAllBuckets = async AWS => {
	const S3 = new AWS.S3();
	const buckets = await S3.listBuckets().promise();
	const promises = buckets.Buckets.map(async bucket => {
		try {
			await emptyBucket(bucket.Name, AWS);
			await S3.deleteBucket({ Bucket: bucket.Name }).promise();
			process.stdout.write(".".green);
			return ClearResult.getSuccess(bucket.Name, null);
		} catch (e) {
			process.stdout.write("F".red);
			return ClearResult.getFailed(bucket.Name, null, e);
		}
	});

	return await Promise.all(promises);
};

const getBucketCount = async AWS => {
	const S3 = new AWS.S3();
	const response = await S3.listBuckets().promise();
	return response.Buckets.length;
};

module.exports = {
	deleteAllBuckets,
	getBucketCount
};
