const { Department } = require("../models");
const { getPagination, paginationMeta } = require("../utils/pagination");
const { recordAudit } = require("../utils/audit");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_NUMBER_PATTERN = /^\+?[0-9][0-9\s().-]{6,19}$/;

const normalizeDepartmentInput = (body, partial = false) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: "Department details are required." };
    }
    const values = {};
    if (!partial || body.name !== undefined) {
        if (typeof body.name !== "string" || body.name.trim().length < 2) {
            return { error: "Department name must be at least 2 characters." };
        }
        values.name = body.name.trim();
    }
    if (!partial || body.code !== undefined) {
        const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
        if (!partial && !code) return { error: "Department code is required." };
        if (code && !/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(code)) {
            return { error: "Department code must be 2–20 letters, numbers, hyphens, or underscores." };
        }
        values.code = code || undefined;
    }
    for (const field of ["description", "contactEmail", "contactNumber"]) {
        if (!partial || body[field] !== undefined) {
            const value = typeof body[field] === "string" ? body[field].trim() : "";
            if (field === "contactEmail" && value && !EMAIL_PATTERN.test(value)) {
                return { error: "Enter a valid department contact email." };
            }
            if (field === "contactNumber" && value && !CONTACT_NUMBER_PATTERN.test(value)) {
                return { error: "Enter a valid department work contact number." };
            }
            if (field === "description" && value.length > 1000) {
                return { error: "Department description must be 1000 characters or fewer." };
            }
            values[field] = field === "contactEmail" ? value.toLowerCase() || undefined : value || undefined;
        }
    }
    if (!partial || body.isActive !== undefined) {
        if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
            return { error: "Department status must be active or inactive." };
        }
        if (!partial || body.isActive !== undefined) values.isActive = body.isActive !== false;
    }
    if (partial && !Object.keys(values).length) return { error: "Provide at least one department field to update." };
    return { values };
};

const hasDuplicateDepartment = async (values, excludedId) => {
    const conditions = [];
    if (values.name) {
        const escaped = values.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        conditions.push({ name: { $regex: `^${escaped}$`, $options: "i" } });
    }
    if (values.code) conditions.push({ code: values.code });
    if (!conditions.length) return false;
    return Boolean(await Department.exists({
        $or: conditions,
        ...(excludedId ? { _id: { $ne: excludedId } } : {}),
    }));
};

const listDepartments = async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.active === "true") filter.isActive = true;
        if (req.query.active === "false") filter.isActive = false;
        if (typeof req.query.search === "string" && req.query.search.trim()) {
            const escapedSearch = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { name: { $regex: escapedSearch, $options: "i" } },
                { code: { $regex: escapedSearch, $options: "i" } },
            ];
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
        const { values, error } = normalizeDepartmentInput(req.body);
        if (error) return res.status(400).json({ message: error });
        if (await hasDuplicateDepartment(values)) {
            return res.status(409).json({ message: "A department with this name or code already exists.", code: "DEPARTMENT_EXISTS" });
        }
        const department = await Department.create(values);
        await recordAudit(req, {
            event: "department_created",
            targetType: "Department",
            targetId: department._id,
            details: `Created department ${department.name}`,
        });
        return res.status(201).json({ department });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "A department with this name or code already exists.", code: "DEPARTMENT_EXISTS" });
        }
        return next(error);
    }
};

const updateDepartment = async (req, res, next) => {
    try {
        const department = await Department.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ message: "Department not found." });
        }
        const { values, error } = normalizeDepartmentInput(req.body, true);
        if (error) return res.status(400).json({ message: error });
        if (await hasDuplicateDepartment(values, department._id)) {
            return res.status(409).json({ message: "A department with this name or code already exists.", code: "DEPARTMENT_EXISTS" });
        }
        Object.assign(department, values);
        await department.save();
        await recordAudit(req, {
            event: "department_updated",
            targetType: "Department",
            targetId: department._id,
            details: `Updated ${department.name}: ${Object.keys(req.body || {}).join(", ") || "no fields"}`,
        });
        return res.json({ department });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "A department with this name or code already exists.", code: "DEPARTMENT_EXISTS" });
        }
        return next(error);
    }
};

module.exports = { listDepartments, createDepartment, updateDepartment };
