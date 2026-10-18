# Archived clinic book

This is the Jaskirat Mithai Clinic simulation. It is not part of the running app.

It used to live on the Clinic tab: a 24-month diabetes and thyroid book for Dr. Jaskirat Mithai, Dr. (Mrs.) Yalina Mithai, and Nurse Gaurav Gera, with patients, visits, a medicine shelf, finance, print preview, and XPS visit sheets. Patient names in that book are made up.

The files here are the routes, the screen, the server functions, the seed, and the two migrations. They are not compiled, and the migrations are not applied. To put the book back, move these files to their old paths and register the `/clinic` routes again.

```
routes/        former src/routes/clinic*.tsx
components/    former src/components/insight/clinic-ui.tsx
lib/           former src/lib/insight/clinic*.ts
migrations/    former migrations/0004_clinic.sql and 0005_visit_status.sql
```
