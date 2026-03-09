# Project Rules

## 1. Convert Code to TypeScript

* All new files must be written using **TypeScript (TS)** instead of JavaScript.
* Existing JavaScript files should be gradually converted to **`.ts` or `.tsx`**.
* Use **Types / Interfaces** to clearly define data structures.
* Avoid using `any` whenever possible.

### Example

```ts
interface User {
  id: string
  name: string
  email: string
  role: string
}
```

---

## 2. Code Organization (Clean Code)

Follow **Clean Code** principles:

* Use clear and descriptive names for variables and functions.
* Each function should have **a single responsibility**.
* Avoid very long functions.
* Remove unused code.
* Reduce code duplication (**DRY: Don't Repeat Yourself**).
* Split logic into separate files when necessary.

---

## 3. Project Structure

Files should be organized as follows:

```
src/
 ├── controllers
 ├── services
 ├── models
 ├── routes
 ├── middleware
 ├── utils
 └── types
```

### Folder Responsibilities

* **controllers** → Handle incoming requests
* **services** → Business logic
* **models** → Database models
* **routes** → API route definitions
* **middleware** → Authentication and permissions
* **utils** → Helper utilities

---

## 4. User System

The project must include a user system with:

* User registration
* User login
* Data storage using **MongoDB**
* Password hashing using **bcrypt**
* Authentication using **JWT**

### Example User Structure

```ts
interface User {
  id: string
  username: string
  email: string
  password: string
  role: "admin" | "user"
}
```

---

## 5. Permissions System

Each user must have a **role** that defines their permissions.

### Roles

#### Admin

* Manage users
* Modify user permissions
* Access the admin dashboard

#### User

* Use the system normally
* Cannot manage other users

### Example Middleware

```ts
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied" })
  }
  next()
}
```

---

## 6. Admin Panel

An **Admin Dashboard** must be implemented with the following features:

* View all users
* Edit user permissions
* Delete users
* Search for users

---

## 7. Support for Nested Folders

The system should allow:

* Creating folders inside the project
* Creating **subfolders** within other folders
* Displaying the folder **tree structure**

### Example

```
project/
 ├── folder1
 │   ├── subfolder1
 │   └── subfolder2
 └── folder2
```

---

## 8. Code Formatting

The following tools should be used:

* **Prettier** for code formatting
* **ESLint** for linting and error detection
* Maintain a consistent coding style across the project
