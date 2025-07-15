const express = require('express')
const mysql = require('mysql2')
const cors = require('cors')
const path = require('path')

const app = express()
const PORT = 3000

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

require('dotenv').config()

const db = mysql.createConnection({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
})
db.connect(err => {
	if (err) {
		console.error('Помилка підключення до MySQL:', err)
	} else {
		console.log('Підключено до MySQL!')
	}
})

// Продукти
app.get('/api/products', (req, res) => {
	db.query('SELECT * FROM Products', (err, results) => {
		if (err) return res.status(500).json({ error: err })
		res.json(results)
	})
})

// Категорії
app.get('/api/categories', (req, res) => {
	db.query('SELECT * FROM Categories', (err, results) => {
		if (err) return res.status(500).json({ error: err })
		res.json(results)
	})
})

// брусок
app.get('/api/brusok', (req, res) => {
	db.query('SELECT * FROM Brusok', (err, results) => {
		if (err) return res.status(500).json({ error: err })
		res.json(results)
	})
})

// суміші
app.get('/api/sumishi', (req, res) => {
	db.query('SELECT * FROM cement', (err, results) => {
		if (err) return res.status(500).json({ error: err })
		res.json(results)
	})
})

// фарби
app.get('/api/farbi', (req, res) => {
	db.query('SELECT * FROM paint', (err, results) => {
		if (err) return res.status(500).json({ error: err })
		res.json(results)
	})
})

// гвинти
app.get('/api/screws', (req, res) => {
	db.query('SELECT * FROM screws', (err, results) => {
		if (err) return res.status(500).json({ error: err })
		res.json(results)
	})
})

// Клієнти
app.get('/api/customers', (req, res) => {
	const sortBy = req.query.sortBy || 'Name'
	const order = req.query.order === 'desc' ? 'DESC' : 'ASC'

	const allowedColumns = ['CustomerID', 'Name', 'Email', 'Phone']
	if (!allowedColumns.includes(sortBy)) {
		return res.status(400).json({ error: 'Недопустиме поле сортування' })
	}

	const sql = `SELECT * FROM Customers ORDER BY ${sortBy} ${order}`

	db.query(sql, (err, results) => {
		if (err) return res.status(500).json({ error: err })
		res.json(results)
	})
})

// Історія покупок
app.get('/api/purchases', (req, res) => {
	const allowedColumns = {
		PurchaseID: 'p.PurchaseID',
		CustomerName: 'c.Name',
		Email: 'c.Email',
		Phone: 'c.Phone',
		ProductName: 'pr.Name',
		PurchaseDate: 'p.PurchaseDate',
		Quantity: 'p.Quantity',
		Price: 'pr.Price',
	}

	const sortBy = req.query.sortBy || 'p.PurchaseDate'
	const order = req.query.order === 'asc' ? 'ASC' : 'DESC'
	const sortColumn = allowedColumns[sortBy] || 'p.PurchaseDate'

	const sql = `
    SELECT p.PurchaseID, c.Name AS CustomerName, c.Email, c.Phone,
           pr.Name AS ProductName, p.PurchaseDate, p.Quantity, pr.Price, pr.Image
    FROM Purchases p
    JOIN Customers c ON p.CustomerID = c.CustomerID
    JOIN Products pr ON p.ProductID = pr.ProductID
    ORDER BY ${sortColumn} ${order}
  `
	db.query(sql, (err, results) => {
		if (err) return res.status(500).json({ error: err })
		res.json(results)
	})
})

// Оформлення покупки
app.post('/api/purchase', (req, res) => {
	const { name, email, phone, productId, quantity } = req.body

	if (!name || !email || !phone || !productId || !quantity) {
		return res.status(400).json({ message: 'Будь ласка, заповніть всі поля' })
	}

	const findCustomerSql = 'SELECT CustomerID FROM Customers WHERE Email = ?'
	db.query(findCustomerSql, [email], (err, customerResults) => {
		if (err) return res.status(500).json({ error: 'Помилка пошуку клієнта' })

		const insertCustomer = callback => {
			const insertSql =
				'INSERT INTO Customers (Name, Email, Phone) VALUES (?, ?, ?)'
			db.query(insertSql, [name, email, phone], (err, result) => {
				if (err)
					return res.status(500).json({ error: 'Помилка додавання клієнта' })
				callback(result.insertId)
			})
		}

		const customerId = customerResults.length
			? customerResults[0].CustomerID
			: null

		if (customerId) {
			processPurchase(customerId)
		} else {
			insertCustomer(newCustomerId => {
				processPurchase(newCustomerId)
			})
		}
	})

	function processPurchase(customerId) {
		db.beginTransaction(err => {
			if (err)
				return res.status(500).json({ error: 'Помилка початку транзакції' })

			const checkQtySql =
				'SELECT Quantity FROM Products WHERE ProductID = ? FOR UPDATE'
			db.query(checkQtySql, [productId], (err, results) => {
				if (err) {
					return db.rollback(() => {
						res
							.status(500)
							.json({ error: 'Помилка перевірки кількості товару' })
					})
				}

				if (results.length === 0) {
					return db.rollback(() => {
						res.status(400).json({ error: 'Товар не знайдено' })
					})
				}

				const currentQty = results[0].Quantity

				if (currentQty < quantity) {
					return db.rollback(() => {
						res
							.status(400)
							.json({ error: 'Недостатня кількість товару на складі' })
					})
				}

				const insertPurchaseSql = `
					INSERT INTO Purchases (CustomerID, ProductID, Quantity, PurchaseDate)
					VALUES (?, ?, ?, NOW())
				`
				db.query(
					insertPurchaseSql,
					[customerId, productId, quantity],
					(err, result) => {
						if (err) {
							return db.rollback(() => {
								res.status(500).json({ error: 'Помилка запису покупки' })
							})
						}

						const updateQtySql = `
						UPDATE Products
						SET Quantity = Quantity - ?
						WHERE ProductID = ?
					`
						db.query(updateQtySql, [quantity, productId], (err, result) => {
							if (err) {
								return db.rollback(() => {
									res
										.status(500)
										.json({ error: 'Помилка оновлення кількості товару' })
								})
							}

							db.commit(err => {
								if (err) {
									return db.rollback(() => {
										res
											.status(500)
											.json({ error: 'Помилка підтвердження транзакції' })
									})
								}

								res.json({ message: 'Покупку успішно оформлено!' })
							})
						})
					}
				)
			})
		})
	}
})

// Сторінки
app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'))
})
app.get('/derevyna', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'brusok.html'))
})
app.get('/sumishi', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'sumishi.html'))
})
app.get('/farbi', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'farbi.html'))
})
app.get('/screws', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'screws.html'))
})
app.get('/customers', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'customers.html'))
})
app.get('/purchases', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'purchases.html'))
})

app.listen(PORT, () => {
	console.log(`Сервер запущено: http://localhost:${PORT}`)
})
