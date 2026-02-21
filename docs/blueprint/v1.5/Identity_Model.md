Identity_Model.md
Identity Model v1.5
1. Identity Layers
Layer	Scope	Unique	Purpose
user_id	global	yes	system reference
display_name	global	no	default public name
group_display_name	group	no	contextual alias
personal_remark	private	no	personal label
2. Display Priority (in group context)

personal_remark

group_display_name

display_name

3. Emoji Policy

Allowed
Max length: 32 characters
Control characters filtered

4. Removal of Per-Club Handle

Per-club handle is deprecated.

Display system relies on:

display_name

group_display_name