/**
 * modules/validator.js
 * Logic for validating extracted data against schemas.
 */

export const Validator = {
    validate(data, schema) {
        if (!schema) return { valid: true };
        
        const errors = [];
        const items = data.items || [data];
        
        items.forEach((item, idx) => {
            for (const field in schema) {
                const rules = schema[field];
                const value = item[field];
                
                if (rules.required && (value === undefined || value === null || value === '')) {
                    errors.push(`Row ${idx + 1}: Field "${field}" is required.`);
                }
                
                if (rules.type === 'number' && isNaN(parseFloat(value))) {
                    errors.push(`Row ${idx + 1}: Field "${field}" must be a number.`);
                }
                
                if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
                    errors.push(`Row ${idx + 1}: Field "${field}" does not match pattern ${rules.pattern}.`);
                }
            }
        });
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
};
