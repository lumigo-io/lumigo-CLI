const { ClearResult } = require("./utils");
const retry = require("async-retry");

const getAllRoles = async AWS => {
	const IAM = new AWS.IAM();

	let foundRoles = [];
	let response = {};
	do {
		const params = response.Marker ? { Marker: response.Marker } : {};
		response = await IAM.listRoles(params).promise();
		foundRoles = foundRoles.concat(
			response.Roles.filter(val => {
				return !val.Path.startsWith("/aws-service-role/");
			}).map(val => {
				return {
					roleId: val.RoleId,
					name: val.RoleName
				};
			})
		);
	} while (response.Marker);

	return foundRoles;
};

const getAllRolesCount = async AWS => {
	return (await getAllRoles(AWS)).length;
};

const deleteRole = async (role, AWS) => {
	const IAM = new AWS.IAM();

	await retry(async bail => {
		try {
			const attachedPolicies = (await IAM.listAttachedRolePolicies({
				RoleName: role.name
			}).promise()).AttachedPolicies;

			const rolePolicies = (await IAM.listRolePolicies({
				RoleName: role.name
			}).promise()).PolicyNames;

			const promises = attachedPolicies.map(async val => {
				await IAM.detachRolePolicy({
					PolicyArn: val.PolicyArn || val.PolicyName,
					RoleName: role.name
				}).promise();
			});

			promises.concat(
				rolePolicies.map(async val => {
					await IAM.deleteRolePolicy({
						PolicyName: val,
						RoleName: role.name
					}).promise();
				})
			);

			await Promise.all(promises);

			await IAM.deleteRole({ RoleName: role.name }).promise();
		} catch (e) {
			if (e.code !== "Throttling") {
				bail(e);
			} else {
				throw e;
			}
		}
	});
};

const deleteAllRoles = async AWS => {
	const allRoles = await getAllRoles(AWS);

	const apiToDeletePromises = allRoles.map(async role => {
		try {
			await deleteRole(role, AWS);
			process.stdout.write(".".green);
			return ClearResult.getSuccess(role.name, "global");
		} catch (e) {
			process.stdout.write("F".red);
			return ClearResult.getFailed(role.name, "global", e);
		}
	});

	return await Promise.all(apiToDeletePromises);
};
module.exports = {
	deleteRole,
	deleteAllRoles,
	getAllRoles,
	getAllRolesCount
};
