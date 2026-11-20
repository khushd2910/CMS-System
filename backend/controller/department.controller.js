const { Department } = require("../models");
const { getPagination, paginationMeta } = require("../utils/pagination");

const listDepartments = async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.active === "true") filter.isActive = true;
        if (req.query.active === "false") filter.isActive = false;
        if (req.query.search) {
            const escapedSearch = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.name = { $regex: escapedSearch, $options: "i" };
        }
        const pagination = getPagination(req.query);
        const total = await Department.countDocuments(filter);
        const departments = await Department.find(filter)
            .sort({ name: 1 })
            .skip(pagination.skip)
            .limit(pagination.limit);
        return res.json({ departments, pagination: paginationMeta(pagination, total) });
    } catch (error) {
        return next(error);
    }
};

const createDepartment = async (req, res, next) => {
    try {
        const department = await Department.create(req.body);
        return res.status(201).json({ department });
    } catch (error) {
        return next(error);
    }
};

const updateDepartment = async (req, res, next) => {
    try {
        const department = await Department.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { returnDocument: "after", runValidators: true }
        );
        if (!department) {
            return res.status(404).json({ message: "Department not found." });
        }
        return res.json({ department });
    } catch (error) {
        return next(error);
    }
};

module.exports = { listDepartments, createDepartment, updateDepartment };
