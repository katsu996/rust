pub mod admin_html;
pub mod delete_room;
pub mod dev_key;
pub mod rooms;
pub mod stats;
pub mod users;

pub use admin_html::handle_admin_html;
pub use delete_room::handle_admin_delete_room;
pub use dev_key::handle_admin_dev_key;
pub use rooms::handle_admin_rooms;
pub use stats::handle_admin_stats;
pub use users::handle_admin_users;
