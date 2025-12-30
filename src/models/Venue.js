const pool = require('../config/database');

class Venue {
    static extractSections(layoutConfig) {
        if (!layoutConfig) return [];
        let cfg = layoutConfig;
        if (typeof cfg === 'string') {
            try {
                cfg = JSON.parse(cfg);
            } catch (err) {
                return [];
            }
        }
        if (Array.isArray(cfg)) return cfg;
        if (cfg && Array.isArray(cfg.sections)) return cfg.sections;
        return [];
    }

    static totalSeatsFromSections(sections) {
        if (!Array.isArray(sections)) return 0;
        let total = 0;
        sections.forEach((section) => {
            if (Array.isArray(section.rows) && section.rows.length) {
                section.rows.forEach((row) => {
                    total += Number(row.seat_count ?? row.count ?? row.seats ?? 0);
                });
            } else if (Array.isArray(section.seats) && section.seats.length) {
                total += section.seats.length;
            } else if (section.capacity) {
                total += Number(section.capacity || 0);
            }
        });
        return total;
    }

    // Create new venue
    static async create(venueData) {
        const { name, address, capacity, layout_type, layout_config } = venueData;
        const safeAddress = address || null;
        const safeLayoutType = layout_type || 'auditorium';
        const sections = this.extractSections(layout_config);
        const seatsFromSections = this.totalSeatsFromSections(sections);
        const safeCapacity = seatsFromSections > 0 ? seatsFromSections : Number(capacity) || 0;
        const safeLayoutConfig = layout_config ? JSON.stringify(layout_config) : null;

        console.log('dY"? [Venue] Creating venue with data:', {
            name, address: safeAddress, capacity: safeCapacity, layout_type: safeLayoutType, layout_config: safeLayoutConfig
        });

        const [result] = await pool.execute(
            `INSERT INTO venues (name, address, capacity, layout_type, layout_config) 
             VALUES (?, ?, ?, ?, ?)`,
            [name, safeAddress, safeCapacity, safeLayoutType, safeLayoutConfig]
        );
        const venueId = result.insertId;

        if (sections.length) {
            await this.updateSeatingLayout(venueId, sections);
        } else if (safeCapacity > 0) {
            await this.ensureDefaultSeating(venueId, safeCapacity);
        }

        return venueId;
    }

    // Get venue by ID
    static async getById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM venues WHERE id = ?',
            [id]
        );
        if (rows[0] && rows[0].layout_config) {
            try {
                rows[0].layout_config = JSON.parse(rows[0].layout_config);
            } catch (e) {
                rows[0].layout_config = null;
            }
        }
        return rows[0];
    }

    // Get all venues
    static async getAll() {
        const [rows] = await pool.execute('SELECT * FROM venues ORDER BY name');
        return rows.map(venue => {
            if (venue.layout_config) {
                try {
                    venue.layout_config = JSON.parse(venue.layout_config);
                } catch (e) {
                    venue.layout_config = null;
                }
            }
            return venue;
        });
    }

    // Update venue
    static async update(id, venueData) {
        const { name, address, capacity, layout_type, layout_config } = venueData;
        const safeAddress = address || null;
        const safeLayoutType = layout_type || 'auditorium';
        const sections = this.extractSections(layout_config);
        const seatsFromSections = this.totalSeatsFromSections(sections);
        const safeCapacity = seatsFromSections > 0 ? seatsFromSections : capacity;
        const safeLayoutConfig = layout_config ? JSON.stringify(layout_config) : null;

        const [result] = await pool.execute(
            `UPDATE venues SET name=?, address=?, capacity=?, layout_type=?, layout_config=?
             WHERE id=?`,
            [name, safeAddress, safeCapacity, safeLayoutType, safeLayoutConfig, id]
        );
        const updated = result.affectedRows > 0;

        if (updated) {
            if (sections.length) {
                await this.updateSeatingLayout(id, sections);
            } else if (safeCapacity > 0) {
                await this.ensureDefaultSeating(id, safeCapacity);
            }
        }

        return updated;
    }

    // Get venue with full seating layout
    static async getVenueWithSeating(venueId) {
        const venue = await this.getById(venueId);
        if (!venue) return null;

        let [sections] = await pool.execute(
            `SELECT ss.*, 
                    COUNT(s.id) as total_seats,
                    SUM(CASE WHEN s.status = 'available' THEN 1 ELSE 0 END) as available_seats
             FROM seating_sections ss
             LEFT JOIN seats s ON ss.id = s.section_id
             WHERE ss.venue_id = ?
             GROUP BY ss.id
             ORDER BY ss.order, ss.name`,
            [venueId]
        );

        // If the venue has capacity but no seating rows yet, auto-generate a basic layout
        if (!sections.length && Number(venue.capacity) > 0) {
            await this.ensureDefaultSeating(venueId, venue.capacity);
            [sections] = await pool.execute(
                `SELECT ss.*, 
                        COUNT(s.id) as total_seats,
                        SUM(CASE WHEN s.status = 'available' THEN 1 ELSE 0 END) as available_seats
                 FROM seating_sections ss
                 LEFT JOIN seats s ON ss.id = s.section_id
                 WHERE ss.venue_id = ?
                 GROUP BY ss.id
                 ORDER BY ss.order, ss.name`,
                [venueId]
            );
        }
        
        // Get seats for each section
        for (let section of sections) {
            const [seats] = await pool.execute(
                `SELECT s.* 
                 FROM seats s 
                 WHERE s.section_id = ? 
                 ORDER BY s.row_label, s.seat_number`,
                [section.id]
            );
            section.seats = seats;
        }

        venue.sections = sections;
        return venue;
    }

    // Delete venue
    static async delete(id) {
        const [result] = await pool.execute(
            'DELETE FROM venues WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }

   // Update seating layout
    static async updateSeatingLayout(venueId, sections) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // 1) Get venue capacity
            const [[venueRow]] = await connection.execute(
                'SELECT capacity FROM venues WHERE id = ?',
                [venueId]
            );
            if (!venueRow) {
                throw new Error('Venue not found');
            }

            const expectedCapacity = Number(venueRow.capacity) || 0;

            // 2) Compute total seats from sections
            //    Supports TWO formats:
            //    A) sections[].rows[].seat_count   (recommended)
            //    B) sections[].seats[]             (explicit seats)
            let totalSeats = 0;

            for (const section of sections) {
                // Prefer rows + seat_count if present
                if (Array.isArray(section.rows) && section.rows.length > 0) {
                    for (const row of section.rows) {
                        const count = Number(row.seat_count ?? row.count ?? row.seats ?? 0);
                        totalSeats += count;
                    }
                } else if (Array.isArray(section.seats) && section.seats.length > 0) {
                    totalSeats += section.seats.length;
                }
            }

            if (expectedCapacity > 0 && totalSeats !== expectedCapacity) {
                throw new Error(`Total seats (${totalSeats}) must equal venue capacity (${expectedCapacity})`);
            }

            // 3) Also validate against active events tied to this venue
            const [events] = await connection.execute(
                'SELECT id, capacity FROM events WHERE venue_id = ? AND is_active = TRUE',
                [venueId]
            );

            for (const evt of events) {
                const eventCap = Number(evt.capacity) || 0;
                if (eventCap > 0 && totalSeats !== eventCap) {
                    throw new Error(`Total seats (${totalSeats}) must equal event capacity (${eventCap}) for event ${evt.id}`);
                }
            }

            // 4) Delete existing sections and seats
            await connection.execute(
                'DELETE s FROM seats s JOIN seating_sections ss ON s.section_id = ss.id WHERE ss.venue_id = ?',
                [venueId]
            );

            await connection.execute(
                'DELETE FROM seating_sections WHERE venue_id = ?',
                [venueId]
            );

            // 5) Create new sections + seats
            for (const section of sections) {
                const safeDescription = section.description || null;
                const safePriceMultiplier = section.price_multiplier || 1.00;
                const safeColor = section.color || '#3498db';
                const safeOrder = section.order || 0;

                // Derive section capacity if not given
                let sectionCapacity = Number(section.capacity || 0);
                if (!sectionCapacity) {
                    if (Array.isArray(section.rows) && section.rows.length > 0) {
                        sectionCapacity = section.rows.reduce(
                            (sum, row) => sum + Number(row.seat_count ?? row.count ?? row.seats ?? 0),
                            0
                        );
                    } else if (Array.isArray(section.seats) && section.seats.length > 0) {
                        sectionCapacity = section.seats.length;
                    }
                }

                const [sectionResult] = await connection.execute(
                    `INSERT INTO seating_sections 
                     (venue_id, name, description, price_multiplier, capacity, color, \`order\`) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        venueId,
                        section.name,
                        safeDescription,
                        safePriceMultiplier,
                        sectionCapacity,
                        safeColor,
                        safeOrder
                    ]
                );

                const sectionId = sectionResult.insertId;

                // 6) Insert seats
                if (Array.isArray(section.seats) && section.seats.length > 0) {
                    // Format B: explicit seats[]
                    for (const seat of section.seats) {
                        const safeX = seat.x_position || 0;
                        const safeY = seat.y_position || 0;
                        const safeStatus = seat.status || 'available';

                        await connection.execute(
                            `INSERT INTO seats 
                             (section_id, row_label, seat_number, x_position, y_position, status) 
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [
                                sectionId,
                                seat.row_label,
                                seat.seat_number,
                                safeX,
                                safeY,
                                safeStatus
                            ]
                        );
                    }
                } else if (Array.isArray(section.rows) && section.rows.length > 0) {
                    // Format A: rows + seat_count (recommended)
                    for (const row of section.rows) {
                        const rowLabel = row.row_label || row.label || row.name || 'A';
                        const seatCount = Number(row.seat_count ?? row.count ?? row.seats ?? 0);

                        for (let i = 1; i <= seatCount; i++) {
                            await connection.execute(
                                `INSERT INTO seats 
                                 (section_id, row_label, seat_number, x_position, y_position, status) 
                                 VALUES (?, ?, ?, ?, ?, ?)`,
                                [
                                    sectionId,
                                    rowLabel,
                                    i,
                                    0,      // x_position
                                    0,      // y_position
                                    'available'
                                ]
                            );
                        }
                    }
                }
            }

            await connection.commit();
            return true;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Ensure a basic seating layout exists by inserting individual seats
    static async ensureDefaultSeating(venueId, capacity) {
        const numericCapacity = Number(capacity) || 0;
        if (!numericCapacity) return [];

        // Skip if sections already exist
        const [existing] = await pool.execute(
            'SELECT id FROM seating_sections WHERE venue_id = ? LIMIT 1',
            [venueId]
        );
        if (existing.length) {
            return existing.map((s) => s.id);
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [sectionResult] = await connection.execute(
                `INSERT INTO seating_sections 
                 (venue_id, name, description, price_multiplier, capacity, color, \`order\`) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    venueId,
                    'General',
                    'Auto-generated section',
                    1.0,
                    numericCapacity,
                    '#2d6cdf',
                    1
                ]
            );
            const sectionId = sectionResult.insertId;

            // Insert seats in batches to avoid huge single statements
            const batchSize = 200;
            const seatRows = [];
            for (let i = 1; i <= numericCapacity; i++) {
                seatRows.push([sectionId, 'A', i, 0, 0, 'available']);
                if (seatRows.length === batchSize) {
                    const placeholders = seatRows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
                    const flat = seatRows.flat();
                    await connection.query(
                        `INSERT INTO seats (section_id, row_label, seat_number, x_position, y_position, status) VALUES ${placeholders}`,
                        flat
                    );
                    seatRows.length = 0;
                }
            }
            if (seatRows.length) {
                const placeholders = seatRows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
                await connection.query(
                    `INSERT INTO seats (section_id, row_label, seat_number, x_position, y_position, status) VALUES ${placeholders}`,
                    seatRows.flat()
                );
            }

            await connection.commit();
            return [sectionId];
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

}

module.exports = Venue;
